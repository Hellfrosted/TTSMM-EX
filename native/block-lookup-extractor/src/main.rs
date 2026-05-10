use std::env;
use std::fs::{self, OpenOptions};
use std::io::BufReader;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use io_unity::classes::ClassIDType;
use io_unity::type_tree::{convert::TryCastFrom, TypeTreeObjectRef};
use io_unity::unity_asset_view::UnityAssetViewer;
use serde::Serialize;

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
    let path = PathBuf::from(source_path);
    match extract_text_assets(&path) {
        Ok(text_assets) => ExtractedBundleFile {
            source_path: source_path.to_owned(),
            text_assets,
            errors: Vec::new(),
        },
        Err(error) => ExtractedBundleFile {
            source_path: source_path.to_owned(),
            text_assets: extract_embedded_text_fallback(&path),
            errors: vec![error.to_string()],
        },
    }
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
