use std::env;
use std::fs::{self, OpenOptions};
use std::io::BufReader;
use std::panic::{self, AssertUnwindSafe};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use io_unity::classes::ClassIDType;
use io_unity::type_tree::{convert::TryCastFrom, TypeTreeObjectRef};
use io_unity::unity_asset_view::UnityAssetViewer;
use serde::Serialize;

const MAX_EMBEDDED_FALLBACK_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtractedTextAsset {
    asset_name: String,
    text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtractedBundleFile {
    source_path: String,
    text_assets: Vec<ExtractedTextAsset>,
    errors: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtractorOutput {
    version: u8,
    files: Vec<ExtractedBundleFile>,
}

fn main() {
    panic::set_hook(Box::new(|_| {}));

    let paths = env::args().skip(1).collect::<Vec<_>>();
    let output = ExtractorOutput {
        version: 1,
        files: paths
            .iter()
            .map(|source_path| extract_file(source_path))
            .collect(),
    };

    match serde_json::to_string(&output) {
        Ok(json) => println!("{json}"),
        Err(error) => {
            eprintln!("Failed to serialize extractor output: {error}");
            std::process::exit(1);
        }
    }
}

fn extract_file(source_path: &str) -> ExtractedBundleFile {
    extract_file_with_parser(source_path, extract_text_assets)
}

fn extract_file_with_parser<F>(source_path: &str, parser: F) -> ExtractedBundleFile
where
    F: FnOnce(&Path) -> Result<Vec<ExtractedTextAsset>>,
{
    let path = PathBuf::from(source_path);
    match panic::catch_unwind(AssertUnwindSafe(|| parser(&path))) {
        Ok(Ok(text_assets)) => ExtractedBundleFile {
            source_path: source_path.to_owned(),
            text_assets,
            errors: Vec::new(),
        },
        Ok(Err(error)) => ExtractedBundleFile {
            source_path: source_path.to_owned(),
            text_assets: extract_embedded_text_fallback(&path),
            errors: vec![format_error_chain(&error)],
        },
        Err(payload) => ExtractedBundleFile {
            source_path: source_path.to_owned(),
            text_assets: extract_embedded_text_fallback(&path),
            errors: vec![format!(
                "panic while parsing Unity bundle: {}",
                panic_payload_message(payload.as_ref())
            )],
        },
    }
}

fn panic_payload_message(payload: &(dyn std::any::Any + Send)) -> String {
    if let Some(message) = payload.downcast_ref::<&str>() {
        return (*message).to_owned();
    }
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    "unknown panic payload".to_owned()
}

fn format_error_chain(error: &anyhow::Error) -> String {
    error
        .chain()
        .map(|cause| cause.to_string())
        .collect::<Vec<_>>()
        .join(": ")
}

fn extract_text_assets(path: &Path) -> Result<Vec<ExtractedTextAsset>> {
    let file = OpenOptions::new()
        .read(true)
        .open(path)
        .with_context(|| format!("open bundle {}", path.display()))?;
    let parent = path
        .parent()
        .map(|parent| parent.to_string_lossy().to_string());
    let mut viewer = UnityAssetViewer::new();
    viewer
        .add_bundle_file(Box::new(BufReader::new(file)), parent)
        .with_context(|| format!("parse Unity bundle {}", path.display()))?;

    let mut text_assets = Vec::new();
    for serialized_file in viewer.serialized_file_map.values() {
        for (path_id, object_metadata) in serialized_file.get_object_map() {
            if object_metadata.class != ClassIDType::TextAsset as i32 {
                continue;
            }

            let Some(object) = serialized_file
                .get_tt_object_by_path_id(*path_id)
                .with_context(|| format!("read TextAsset object {path_id}"))?
            else {
                continue;
            };

            let object_ref: TypeTreeObjectRef = object.into();
            let asset_name =
                String::try_cast_from(&object_ref, "/Base/m_Name").unwrap_or_else(|_| {
                    path.file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string()
                });
            let text = String::try_cast_from(&object_ref, "/Base/m_Script").unwrap_or_default();

            if text.contains("NuterraBlock") {
                text_assets.push(ExtractedTextAsset { asset_name, text });
            }
        }
    }

    Ok(text_assets)
}

fn extract_embedded_text_fallback(path: &Path) -> Vec<ExtractedTextAsset> {
    if fs::metadata(path)
        .map(|metadata| metadata.len() > MAX_EMBEDDED_FALLBACK_BYTES)
        .unwrap_or(true)
    {
        return Vec::new();
    }

    let Ok(bytes) = fs::read(path) else {
        return Vec::new();
    };
    let asset_name = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let mut text_assets = Vec::new();

    if let Ok(text) = String::from_utf8(bytes.clone()) {
        if text.contains("NuterraBlock") {
            text_assets.push(ExtractedTextAsset {
                asset_name: asset_name.clone(),
                text,
            });
        }
    }

    let utf16_units = bytes
        .chunks_exact(2)
        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
        .collect::<Vec<_>>();
    if let Ok(text) = String::from_utf16(&utf16_units) {
        if text.contains("NuterraBlock") {
            text_assets.push(ExtractedTextAsset { asset_name, text });
        }
    }

    text_assets
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn falls_back_to_embedded_text_when_parser_panics() {
        let previous_hook = panic::take_hook();
        panic::set_hook(Box::new(|_| {}));

        let source_path = env::temp_dir().join(format!(
            "ttsmm-extractor-panic-{}-{}.bundle",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time should be after Unix epoch")
                .as_nanos()
        ));
        fs::write(
            &source_path,
            br#"UnityFS{"m_Name":"Synthetic_Block","Type":"NuterraBlock","Name":"Synthetic Block","ID":42}"#,
        )
        .expect("write synthetic bundle");

        let result = extract_file_with_parser(
            source_path
                .to_str()
                .expect("temp path should be valid UTF-8"),
            |_| -> Result<Vec<ExtractedTextAsset>> {
                panic!("synthetic parser panic");
            },
        );

        fs::remove_file(&source_path).expect("remove synthetic bundle");
        panic::set_hook(previous_hook);

        assert_eq!(
            result.source_path,
            source_path
                .to_str()
                .expect("temp path should be valid UTF-8")
        );
        assert_eq!(result.text_assets.len(), 1);
        assert!(result.text_assets[0].text.contains("Synthetic Block"));
        assert_eq!(result.errors.len(), 1);
        assert!(result.errors[0].contains("synthetic parser panic"));
    }
}
