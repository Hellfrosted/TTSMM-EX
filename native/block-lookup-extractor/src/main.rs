use std::env;
use std::fs::{self, OpenOptions};
use std::io::{BufReader, Cursor};
use std::panic::{self, AssertUnwindSafe};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use image::{DynamicImage, ImageOutputFormat, Rgba, RgbaImage};
use io_unity::classes::mesh::{Mesh, MeshObject};
use io_unity::classes::texture2d::{Texture2D, Texture2DObject};
use io_unity::classes::ClassIDType;
use io_unity::type_tree::{convert::TryCastFrom, TypeTreeObjectRef};
use io_unity::unity_asset_view::UnityAssetViewer;
use serde::Serialize;
use sha2::{Digest, Sha256};

const MAX_PREVIEW_ASSETS_PER_FILE: usize = 4096;
const MAX_PREVIEW_DIMENSION: u32 = 512;
const MESH_PREVIEW_SIZE: u32 = 96;
const MESH_PREVIEW_PADDING: f32 = 8.0;
const MAX_MESH_PREVIEW_TRIANGLES: usize = 16_384;
const PREVIEW_CACHE_ENV: &str = "TTSMM_BLOCK_LOOKUP_PREVIEW_CACHE_DIR";
const PREVIEW_MATCH_NAMES_FILE_ENV: &str = "TTSMM_BLOCK_LOOKUP_PREVIEW_MATCH_NAMES_FILE";

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

#[derive(Clone, Copy)]
struct Vec3 {
    x: f32,
    y: f32,
    z: f32,
}

#[derive(Clone, Copy)]
struct ProjectedVertex {
    x: f32,
    y: f32,
    depth: f32,
}

#[derive(Clone, Copy)]
struct MeshTriangle {
    vertices: [Vec3; 3],
}

#[derive(Clone, Copy)]
struct ProjectedTriangle {
    points: [ProjectedVertex; 3],
    color: Rgba<u8>,
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
            text_assets: Vec::new(),
            preview_assets: Vec::new(),
            errors: vec![format_error_chain(&error)],
        },
        Err(payload) => ExtractedBundleFile {
            source_path: source_path.to_owned(),
            text_assets: Vec::new(),
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
    if let Err(bundle_error) =
        viewer.add_bundle_file(Box::new(BufReader::new(file)), parent.clone())
    {
        let serialized_file = OpenOptions::new()
            .read(true)
            .open(path)
            .with_context(|| format!("open serialized Unity asset {}", path.display()))?;
        viewer
            .add_serialized_file(Box::new(BufReader::new(serialized_file)), parent)
            .with_context(|| {
                format!(
                    "parse Unity bundle or serialized asset {}: {}",
                    path.display(),
                    bundle_error
                )
            })?;
    }

    let mut text_assets = Vec::new();
    let mut preview_assets = Vec::new();
    for serialized_file in viewer.serialized_file_map.values() {
        for (path_id, object_metadata) in serialized_file.get_object_map() {
            if object_metadata.class != ClassIDType::TextAsset as i32 {
                continue;
            }

            let Some(object) = (match serialized_file.get_tt_object_by_path_id(*path_id) {
                Ok(object) => object,
                Err(_) => continue,
            }) else {
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

    let Some(preview_cache_dir) = preview_cache_dir else {
        return Ok(ExtractedBundleContents {
            text_assets,
            preview_assets,
        });
    };

    let preview_match_keys = create_preview_match_keys(&text_assets);
    for serialized_file in viewer.serialized_file_map.values() {
        for (path_id, object_metadata) in serialized_file.get_object_map() {
            if object_metadata.class == ClassIDType::Texture2D as i32 {
                if preview_assets.len() >= MAX_PREVIEW_ASSETS_PER_FILE {
                    continue;
                }
                let Some(object) = (match serialized_file.get_tt_object_by_path_id(*path_id) {
                    Ok(object) => object,
                    Err(_) => continue,
                }) else {
                    continue;
                };

                let object_ref: TypeTreeObjectRef = object.into();
                let asset_name = read_asset_name(&object_ref, path);
                if !should_extract_preview_asset(&asset_name, &preview_match_keys) {
                    continue;
                }
                if let Ok(preview_asset) =
                    extract_preview_asset(&viewer, &object_ref, path, asset_name, preview_cache_dir)
                {
                    preview_assets.push(preview_asset);
                }
            }
        }
    }

    for serialized_file in viewer.serialized_file_map.values() {
        for (path_id, object_metadata) in serialized_file.get_object_map() {
            if object_metadata.class != ClassIDType::Mesh as i32 {
                continue;
            }
            if preview_assets.len() >= MAX_PREVIEW_ASSETS_PER_FILE {
                continue;
            }
            let Some(object) = (match serialized_file.get_tt_object_by_path_id(*path_id) {
                Ok(object) => object,
                Err(_) => continue,
            }) else {
                continue;
            };

            let object_ref: TypeTreeObjectRef = object.into();
            let asset_name = read_asset_name(&object_ref, path);
            if !should_extract_preview_asset(&asset_name, &preview_match_keys) {
                continue;
            }
            if let Ok(preview_asset) =
                extract_mesh_preview_asset(&object_ref, path, asset_name, preview_cache_dir)
            {
                preview_assets.push(preview_asset);
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

fn create_preview_asset_name_candidates(value: &str) -> Vec<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let normalized_path = trimmed.replace('\\', "/");
    let file_name = normalized_path.rsplit('/').next().unwrap_or(trimmed);
    let stem = file_name
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(file_name);
    [trimmed, file_name, stem]
        .into_iter()
        .map(normalized_asset_key)
        .filter(|key| key.len() >= 3)
        .collect()
}

fn create_preview_match_keys(text_assets: &[ExtractedTextAsset]) -> Vec<String> {
    let mut keys = text_assets
        .iter()
        .flat_map(|asset| {
            let mut values = vec![asset.asset_name.clone()];
            values.extend(
                [
                    read_json_string_property(&asset.text, "m_Name"),
                    read_json_string_property(&asset.text, "Name"),
                    read_json_string_property(&asset.text, "IconName"),
                    read_json_string_property(&asset.text, "MeshName"),
                ]
                .into_iter()
                .flatten(),
            );
            values
        })
        .flat_map(|value| create_preview_asset_name_candidates(&value))
        .collect::<Vec<_>>();
    keys.extend(
        read_preview_match_names_file()
            .into_iter()
            .filter(|key| key.len() >= 3),
    );
    keys.sort();
    keys.dedup();
    keys
}

fn read_preview_match_names_file() -> Vec<String> {
    let Ok(match_names_file) = env::var(PREVIEW_MATCH_NAMES_FILE_ENV) else {
        return Vec::new();
    };
    let Ok(contents) = fs::read_to_string(match_names_file) else {
        return Vec::new();
    };
    contents
        .lines()
        .map(normalized_asset_key)
        .filter(|key| key.len() >= 3)
        .collect()
}

fn should_extract_preview_asset(asset_name: &str, preview_match_keys: &[String]) -> bool {
    let asset_key = normalized_asset_key(asset_name);
    if asset_key.len() < 3 {
        return false;
    }

    if preview_match_keys
        .iter()
        .any(|key| asset_key.contains(key) || key.contains(&asset_key))
    {
        return true;
    }

    if !preview_match_keys.is_empty() {
        return false;
    }

    [
        "preview",
        "thumbnail",
        "thumb",
        "icon",
        "portrait",
        "render",
    ]
    .iter()
    .any(|term| asset_key.contains(term))
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
    let thumbnail = image
        .rotate180()
        .thumbnail(MAX_PREVIEW_DIMENSION, MAX_PREVIEW_DIMENSION);
    if is_flat_preview_image(&thumbnail) {
        anyhow::bail!("Texture2D preview {asset_name} decoded to a flat image");
    }
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

fn extract_mesh_preview_asset(
    object_ref: &TypeTreeObjectRef,
    source_path: &Path,
    asset_name: String,
    preview_cache_dir: &Path,
) -> Result<ExtractedPreviewAsset> {
    let mesh = Mesh::new(object_ref);
    let triangles = collect_mesh_triangles(&mesh)
        .with_context(|| format!("read Mesh preview geometry {asset_name}"))?;
    extract_mesh_triangles_preview_asset(source_path, asset_name, &triangles, preview_cache_dir)
}

fn extract_mesh_triangles_preview_asset(
    source_path: &Path,
    asset_name: String,
    triangles: &[MeshTriangle],
    preview_cache_dir: &Path,
) -> Result<ExtractedPreviewAsset> {
    let image = render_mesh_preview(&triangles)
        .with_context(|| format!("render Mesh preview {asset_name}"))?;
    let rendered = DynamicImage::ImageRgba8(image);
    if is_flat_preview_image(&rendered) {
        anyhow::bail!("Mesh preview {asset_name} rendered to a flat image");
    }
    let width = rendered.width();
    let height = rendered.height();
    let mut png = Cursor::new(Vec::new());
    rendered
        .write_to(&mut png, ImageOutputFormat::Png)
        .with_context(|| format!("encode Mesh preview {asset_name}"))?;
    let png = png.into_inner();
    let cache_relative_path = format!(
        "mesh/{}.png",
        hash_preview_asset(source_path, &asset_name, &png)
    );
    let cache_path =
        preview_cache_dir.join(cache_relative_path.replace('/', std::path::MAIN_SEPARATOR_STR));
    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("create preview cache directory {}", parent.display()))?;
    }
    fs::write(&cache_path, png)
        .with_context(|| format!("write Mesh preview cache file {}", cache_path.display()))?;
    Ok(ExtractedPreviewAsset {
        asset_name,
        cache_relative_path,
        width,
        height,
    })
}

fn collect_mesh_triangles(mesh: &Mesh<'_>) -> Result<Vec<MeshTriangle>> {
    let mut triangles = Vec::new();
    for sub_mesh_id in 0..mesh.get_sub_mesh_count()? {
        let vertex_values = mesh.get_vertex_buff(sub_mesh_id)?;
        let vertices = vertex_values
            .chunks_exact(3)
            .map(|chunk| Vec3 {
                x: chunk[0],
                y: chunk[1],
                z: chunk[2],
            })
            .collect::<Vec<_>>();
        if vertices.len() < 3 {
            continue;
        }

        for triangle_indices in mesh.get_index_buff(sub_mesh_id)?.chunks_exact(3) {
            if triangles.len() >= MAX_MESH_PREVIEW_TRIANGLES {
                return Ok(triangles);
            }
            let [a, b, c] = [
                triangle_indices[0] as usize,
                triangle_indices[1] as usize,
                triangle_indices[2] as usize,
            ];
            let (Some(&a), Some(&b), Some(&c)) =
                (vertices.get(a), vertices.get(b), vertices.get(c))
            else {
                continue;
            };
            if triangle_area_3d(a, b, c) <= f32::EPSILON {
                continue;
            }
            triangles.push(MeshTriangle {
                vertices: [a, b, c],
            });
        }
    }
    if triangles.is_empty() {
        anyhow::bail!("mesh has no renderable triangles");
    }
    Ok(triangles)
}

fn render_mesh_preview(triangles: &[MeshTriangle]) -> Result<RgbaImage> {
    if triangles.is_empty() {
        anyhow::bail!("mesh has no renderable triangles");
    }

    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    for triangle in triangles {
        for vertex in triangle.vertices {
            let projected = project_vertex(vertex);
            min_x = min_x.min(projected.x);
            min_y = min_y.min(projected.y);
            max_x = max_x.max(projected.x);
            max_y = max_y.max(projected.y);
        }
    }

    let width = max_x - min_x;
    let height = max_y - min_y;
    if !width.is_finite() || !height.is_finite() || width <= f32::EPSILON || height <= f32::EPSILON
    {
        anyhow::bail!("mesh bounds are not renderable");
    }

    let drawable_size = MESH_PREVIEW_SIZE as f32 - MESH_PREVIEW_PADDING * 2.0;
    let scale = drawable_size / width.max(height);
    let offset_x = (MESH_PREVIEW_SIZE as f32 - width * scale) / 2.0;
    let offset_y = (MESH_PREVIEW_SIZE as f32 - height * scale) / 2.0;
    let mut projected_triangles = triangles
        .iter()
        .map(|triangle| {
            let points = triangle.vertices.map(|vertex| {
                let projected = project_vertex(vertex);
                ProjectedVertex {
                    x: (projected.x - min_x) * scale + offset_x,
                    y: (projected.y - min_y) * scale + offset_y,
                    depth: projected.depth,
                }
            });
            ProjectedTriangle {
                points,
                color: shade_triangle(*triangle),
            }
        })
        .collect::<Vec<_>>();
    projected_triangles.sort_by(|a, b| average_depth(a).total_cmp(&average_depth(b)));

    let mut image = RgbaImage::from_pixel(MESH_PREVIEW_SIZE, MESH_PREVIEW_SIZE, Rgba([0, 0, 0, 0]));
    for triangle in &projected_triangles {
        fill_triangle(&mut image, triangle);
    }
    for triangle in &projected_triangles {
        draw_triangle_edges(&mut image, triangle);
    }
    Ok(image)
}

fn project_vertex(vertex: Vec3) -> ProjectedVertex {
    let yaw = -45.0_f32.to_radians();
    let pitch = -28.0_f32.to_radians();
    let yaw_cos = yaw.cos();
    let yaw_sin = yaw.sin();
    let pitch_cos = pitch.cos();
    let pitch_sin = pitch.sin();

    let x = vertex.x * yaw_cos - vertex.z * yaw_sin;
    let z = vertex.x * yaw_sin + vertex.z * yaw_cos;
    let y = vertex.y;
    let projected_y = y * pitch_cos - z * pitch_sin;
    let depth = y * pitch_sin + z * pitch_cos;
    ProjectedVertex {
        x,
        y: -projected_y,
        depth,
    }
}

fn shade_triangle(triangle: MeshTriangle) -> Rgba<u8> {
    let normal = normalize(cross(
        subtract(triangle.vertices[1], triangle.vertices[0]),
        subtract(triangle.vertices[2], triangle.vertices[0]),
    ));
    let light = normalize(Vec3 {
        x: -0.35,
        y: 0.78,
        z: -0.52,
    });
    let intensity = (0.42 + dot(normal, light).abs() * 0.48).clamp(0.35, 0.95);
    Rgba([
        (118.0 * intensity) as u8,
        (139.0 * intensity) as u8,
        (130.0 * intensity) as u8,
        238,
    ])
}

fn average_depth(triangle: &ProjectedTriangle) -> f32 {
    (triangle.points[0].depth + triangle.points[1].depth + triangle.points[2].depth) / 3.0
}

fn fill_triangle(image: &mut RgbaImage, triangle: &ProjectedTriangle) {
    let [a, b, c] = triangle.points;
    let min_x = a.x.min(b.x).min(c.x).floor().max(0.0) as u32;
    let min_y = a.y.min(b.y).min(c.y).floor().max(0.0) as u32;
    let max_x = a.x.max(b.x).max(c.x).ceil().min((image.width() - 1) as f32) as u32;
    let max_y =
        a.y.max(b.y)
            .max(c.y)
            .ceil()
            .min((image.height() - 1) as f32) as u32;
    let area = edge(a, b, c.x, c.y);
    if area.abs() <= f32::EPSILON {
        return;
    }

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let px = x as f32 + 0.5;
            let py = y as f32 + 0.5;
            let w0 = edge(b, c, px, py);
            let w1 = edge(c, a, px, py);
            let w2 = edge(a, b, px, py);
            if (w0 >= 0.0 && w1 >= 0.0 && w2 >= 0.0) || (w0 <= 0.0 && w1 <= 0.0 && w2 <= 0.0) {
                blend_pixel(image.get_pixel_mut(x, y), triangle.color);
            }
        }
    }
}

fn draw_triangle_edges(image: &mut RgbaImage, triangle: &ProjectedTriangle) {
    let edge_color = Rgba([18, 24, 22, 90]);
    draw_line(image, triangle.points[0], triangle.points[1], edge_color);
    draw_line(image, triangle.points[1], triangle.points[2], edge_color);
    draw_line(image, triangle.points[2], triangle.points[0], edge_color);
}

fn draw_line(image: &mut RgbaImage, start: ProjectedVertex, end: ProjectedVertex, color: Rgba<u8>) {
    let steps = (start.x - end.x).abs().max((start.y - end.y).abs()).ceil() as u32;
    if steps == 0 {
        return;
    }
    for step in 0..=steps {
        let t = step as f32 / steps as f32;
        let x = (start.x + (end.x - start.x) * t).round() as i32;
        let y = (start.y + (end.y - start.y) * t).round() as i32;
        if x >= 0 && y >= 0 && x < image.width() as i32 && y < image.height() as i32 {
            blend_pixel(image.get_pixel_mut(x as u32, y as u32), color);
        }
    }
}

fn edge(a: ProjectedVertex, b: ProjectedVertex, x: f32, y: f32) -> f32 {
    (x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x)
}

fn blend_pixel(target: &mut Rgba<u8>, source: Rgba<u8>) {
    let source_alpha = source[3] as f32 / 255.0;
    let target_alpha = target[3] as f32 / 255.0;
    let out_alpha = source_alpha + target_alpha * (1.0 - source_alpha);
    if out_alpha <= f32::EPSILON {
        *target = Rgba([0, 0, 0, 0]);
        return;
    }

    for channel in 0..3 {
        target[channel] = (((source[channel] as f32 * source_alpha)
            + (target[channel] as f32 * target_alpha * (1.0 - source_alpha)))
            / out_alpha)
            .round() as u8;
    }
    target[3] = (out_alpha * 255.0).round() as u8;
}

fn triangle_area_3d(a: Vec3, b: Vec3, c: Vec3) -> f32 {
    length(cross(subtract(b, a), subtract(c, a))) * 0.5
}

fn subtract(a: Vec3, b: Vec3) -> Vec3 {
    Vec3 {
        x: a.x - b.x,
        y: a.y - b.y,
        z: a.z - b.z,
    }
}

fn cross(a: Vec3, b: Vec3) -> Vec3 {
    Vec3 {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    }
}

fn dot(a: Vec3, b: Vec3) -> f32 {
    a.x * b.x + a.y * b.y + a.z * b.z
}

fn normalize(value: Vec3) -> Vec3 {
    let length = length(value);
    if length <= f32::EPSILON {
        return Vec3 {
            x: 0.0,
            y: 1.0,
            z: 0.0,
        };
    }
    Vec3 {
        x: value.x / length,
        y: value.y / length,
        z: value.z / length,
    }
}

fn length(value: Vec3) -> f32 {
    dot(value, value).sqrt()
}

fn is_flat_preview_image(image: &image::DynamicImage) -> bool {
    let rgba = image.to_rgba8();
    if rgba.width() == 0 || rgba.height() == 0 {
        return true;
    }

    let mut min_channels = [u8::MAX; 4];
    let mut max_channels = [u8::MIN; 4];
    for pixel in rgba.pixels() {
        for (index, channel) in pixel.0.iter().enumerate() {
            min_channels[index] = min_channels[index].min(*channel);
            max_channels[index] = max_channels[index].max(*channel);
        }
    }

    max_channels[3] == 0
        || min_channels
            .iter()
            .zip(max_channels.iter())
            .all(|(min_channel, max_channel)| max_channel.saturating_sub(*min_channel) <= 2)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, ImageBuffer, Rgba};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn reports_parser_panic_without_raw_text_fallback() {
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
        assert_eq!(result.text_assets.len(), 0);
        assert_eq!(result.preview_assets.len(), 0);
        assert_eq!(result.errors.len(), 1);
        assert!(result.errors[0].contains("synthetic parser panic"));
    }

    #[test]
    fn detects_flat_preview_images() {
        let flat =
            DynamicImage::ImageRgba8(ImageBuffer::from_pixel(4, 4, Rgba([170, 170, 170, 255])));
        assert!(is_flat_preview_image(&flat));

        let mut varied = ImageBuffer::from_pixel(4, 4, Rgba([170, 170, 170, 255]));
        varied.put_pixel(1, 1, Rgba([24, 180, 92, 255]));
        assert!(!is_flat_preview_image(&DynamicImage::ImageRgba8(varied)));
    }

    #[test]
    fn does_not_extract_unmatched_textures_without_block_keys() {
        assert!(!should_extract_preview_asset("GSO_00_E", &[]));
    }

    #[test]
    fn does_not_extract_generic_preview_names_when_block_keys_exist() {
        assert!(!should_extract_preview_asset(
            "ICON_ACTION_PAINT",
            &["gsocab211".to_owned()]
        ));
    }

    #[test]
    fn builds_preview_match_keys_from_icon_and_mesh_names() {
        let keys = create_preview_match_keys(&[ExtractedTextAsset {
            asset_name: "JormungandBlock".to_owned(),
            text: r#"{"m_Name":"HE_Jormungand_Railgun","Type":"NuterraBlock","Name":"Hawkeye Jormungand","IconName":"Textures\\HE_Jormungand_Railcannon.png","MeshName":"Meshes/HE_Block_Collector.obj"}"#
                .to_owned(),
        }]);

        assert!(keys.contains(&"hejormungandrailcannon".to_owned()));
        assert!(keys.contains(&"heblockcollector".to_owned()));
        assert!(should_extract_preview_asset(
            "HE_Jormungand_Railcannon",
            &keys
        ));
        assert!(should_extract_preview_asset("HE_Block_Collector", &keys));
    }

    #[test]
    fn render_mesh_preview_returns_non_flat_image_for_triangle_geometry() {
        let triangles = vec![MeshTriangle {
            vertices: [
                Vec3 {
                    x: -1.0,
                    y: 0.0,
                    z: 0.0,
                },
                Vec3 {
                    x: 1.0,
                    y: 0.0,
                    z: 0.0,
                },
                Vec3 {
                    x: 0.0,
                    y: 1.0,
                    z: 0.0,
                },
            ],
        }];

        let image = render_mesh_preview(&triangles).expect("triangle mesh should render");

        assert_eq!(image.width(), MESH_PREVIEW_SIZE);
        assert!(!is_flat_preview_image(&DynamicImage::ImageRgba8(image)));
    }
}
