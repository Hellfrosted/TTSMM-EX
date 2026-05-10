use std::env;
use std::fs::{self, OpenOptions};
use std::io::{BufReader, Cursor};
use std::panic::{self, AssertUnwindSafe};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use image::ImageOutputFormat;
use io_unity::classes::texture2d::{Texture2D, Texture2DObject};
use io_unity::classes::ClassIDType;
use io_unity::type_tree::{convert::TryCastFrom, TypeTreeObjectRef};
use io_unity::unity_asset_view::UnityAssetViewer;
use serde::Serialize;
use sha2::{Digest, Sha256};

const MAX_EMBEDDED_FALLBACK_BYTES: u64 = 32 * 1024 * 1024;
const MAX_PREVIEW_ASSETS_PER_FILE: usize = 128;
const MAX_PREVIEW_DIMENSION: u32 = 512;
const PREVIEW_CACHE_ENV: &str = "TTSMM_BLOCK_LOOKUP_PREVIEW_CACHE_DIR";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtractedTextAsset {
    asset_name: String,
    text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtractedPreviewAsset {
    asset_name: String,
    cache_relative_path: String,
    width: u32,
    height: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtractedBundleFile {
    source_path: String,
    text_assets: Vec<ExtractedTextAsset>,
    preview_assets: Vec<ExtractedPreviewAsset>,
    errors: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtractorOutput {
    version: u8,
    files: Vec<ExtractedBundleFile>,
}

#[derive(Default)]
struct ExtractedBundleContents {
    text_assets: Vec<ExtractedTextAsset>,
    preview_assets: Vec<ExtractedPreviewAsset>,
}

fn main() {
    panic::set_hook(Box::new(|_| {}));

    let paths = env::args().skip(1).collect::<Vec<_>>();
    let output = ExtractorOutput {
        version: 2,
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
    let preview_cache_dir = env::var(PREVIEW_CACHE_ENV).ok().map(PathBuf::from);
    extract_file_with_parser(source_path, |path| {
        extract_text_assets(path, preview_cache_dir.as_deref())
    })
}

fn extract_file_with_parser<F>(source_path: &str, parser: F) -> ExtractedBundleFile
where
    F: FnOnce(&Path) -> Result<ExtractedBundleContents>,
{
    let path = PathBuf::from(source_path);
    match panic::catch_unwind(AssertUnwindSafe(|| parser(&path))) {
        Ok(Ok(contents)) => ExtractedBundleFile {
            source_path: source_path.to_owned(),
            text_assets: contents.text_assets,
            preview_assets: contents.preview_assets,
            errors: Vec::new(),
        },
        Ok(Err(error)) => ExtractedBundleFile {
            source_path: source_path.to_owned(),
            text_assets: extract_embedded_text_fallback(&path),
            preview_assets: Vec::new(),
            errors: vec![format_error_chain(&error)],
        },
        Err(payload) => ExtractedBundleFile {
            source_path: source_path.to_owned(),
            text_assets: extract_embedded_text_fallback(&path),
            preview_assets: Vec::new(),
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

fn extract_text_assets(
    path: &Path,
    preview_cache_dir: Option<&Path>,
) -> Result<ExtractedBundleContents> {
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
    let mut preview_assets = Vec::new();
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
            let asset_name = read_asset_name(&object_ref, path);
            let text = String::try_cast_from(&object_ref, "/Base/m_Script").unwrap_or_default();

            if text.contains("NuterraBlock") {
                text_assets.push(ExtractedTextAsset { asset_name, text });
            }
        }
    }

    let preview_match_keys = create_preview_match_keys(&text_assets);
    for serialized_file in viewer.serialized_file_map.values() {
        for (path_id, object_metadata) in serialized_file.get_object_map() {
            if object_metadata.class == ClassIDType::Texture2D as i32 {
                if preview_assets.len() >= MAX_PREVIEW_ASSETS_PER_FILE {
                    continue;
                }
                let Some(object) = serialized_file
                    .get_tt_object_by_path_id(*path_id)
                    .with_context(|| format!("read Texture2D object {path_id}"))?
                else {
                    continue;
                };

                let object_ref: TypeTreeObjectRef = object.into();
                let asset_name = read_asset_name(&object_ref, path);
                if !should_extract_preview_asset(&asset_name, &preview_match_keys) {
                    continue;
                }
                let Some(preview_cache_dir) = preview_cache_dir else {
                    continue;
                };
                if let Ok(preview_asset) =
                    extract_preview_asset(&viewer, &object_ref, path, asset_name, preview_cache_dir)
                {
                    preview_assets.push(preview_asset);
                }
            }
        }
    }

    Ok(ExtractedBundleContents {
        text_assets,
        preview_assets,
    })
}

fn read_asset_name(object_ref: &TypeTreeObjectRef, path: &Path) -> String {
    String::try_cast_from(object_ref, "/Base/m_Name").unwrap_or_else(|_| {
        path.file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    })
}

fn read_json_string_property(text: &str, property_name: &str) -> Option<String> {
    let property = format!("\"{property_name}\"");
    let property_index = text.find(&property)?;
    let after_property = &text[property_index + property.len()..];
    let colon_index = after_property.find(':')?;
    let after_colon = after_property[colon_index + 1..].trim_start();
    let value = after_colon.strip_prefix('"')?;
    let end_index = value.find('"')?;
    Some(value[..end_index].to_owned())
}

fn normalized_asset_key(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(|character| character.to_lowercase())
        .collect()
}

fn create_preview_match_keys(text_assets: &[ExtractedTextAsset]) -> Vec<String> {
    text_assets
        .iter()
        .flat_map(|asset| {
            [
                Some(asset.asset_name.clone()),
                read_json_string_property(&asset.text, "m_Name"),
                read_json_string_property(&asset.text, "Name"),
            ]
        })
        .flatten()
        .map(|value| normalized_asset_key(&value))
        .filter(|key| key.len() >= 3)
        .collect()
}

fn should_extract_preview_asset(asset_name: &str, preview_match_keys: &[String]) -> bool {
    let asset_key = normalized_asset_key(asset_name);
    if asset_key.len() < 3 {
        return false;
    }
    if [
        "preview",
        "thumbnail",
        "thumb",
        "icon",
        "portrait",
        "render",
    ]
    .iter()
    .any(|term| asset_key.contains(term))
    {
        return true;
    }

    preview_match_keys
        .iter()
        .any(|key| asset_key.contains(key) || key.contains(&asset_key))
}

fn hash_preview_asset(source_path: &Path, asset_name: &str, png: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(source_path.to_string_lossy().as_bytes());
    hasher.update(b"\0");
    hasher.update(asset_name.as_bytes());
    hasher.update(b"\0");
    hasher.update(png);
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn extract_preview_asset(
    viewer: &UnityAssetViewer,
    object_ref: &TypeTreeObjectRef,
    source_path: &Path,
    asset_name: String,
    preview_cache_dir: &Path,
) -> Result<ExtractedPreviewAsset> {
    let texture = Texture2D::new(object_ref);
    let image = texture
        .get_image(viewer)
        .with_context(|| format!("decode Texture2D preview {asset_name}"))?;
    let thumbnail = image.thumbnail(MAX_PREVIEW_DIMENSION, MAX_PREVIEW_DIMENSION);
    let mut png = Cursor::new(Vec::new());
    thumbnail
        .write_to(&mut png, ImageOutputFormat::Png)
        .with_context(|| format!("encode Texture2D preview {asset_name}"))?;
    let png = png.into_inner();
    let cache_relative_path = format!(
        "bundle/{}.png",
        hash_preview_asset(source_path, &asset_name, &png)
    );
    let cache_path =
        preview_cache_dir.join(cache_relative_path.replace('/', std::path::MAIN_SEPARATOR_STR));
    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("create preview cache directory {}", parent.display()))?;
    }
    fs::write(&cache_path, png).with_context(|| {
        format!(
            "write Texture2D preview cache file {}",
            cache_path.display()
        )
    })?;
    Ok(ExtractedPreviewAsset {
        asset_name,
        cache_relative_path,
        width: thumbnail.width(),
        height: thumbnail.height(),
    })
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
            |_| -> Result<ExtractedBundleContents> {
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
        assert_eq!(result.preview_assets.len(), 0);
        assert!(result.text_assets[0].text.contains("Synthetic Block"));
        assert_eq!(result.errors.len(), 1);
        assert!(result.errors[0].contains("synthetic parser panic"));
    }
}
