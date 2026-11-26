#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use someterm_native::{Backend, Event, InputSignals, Options, OutputSignals, Port};
use tauri::{ipc::Channel, State};

#[tauri::command]
fn native_capabilities() -> serde_json::Value {
    serde_json::json!({"markSpaceParity":cfg!(windows),"dsrDtrFlow":false,"xonXoffFlow":true,"oneAndHalfStopBits":cfg!(windows),"fiveSixDataBits":true,"portMetadata":true,"sendBreak":true,"lineSignals":true,"ringIndicator":false})
}
#[tauri::command]
async fn native_list() -> Result<Vec<Port>, String> {
    tauri::async_runtime::spawn_blocking(someterm_native::list_ports)
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn native_open(
    state: State<'_, Backend>,
    path: String,
    options: Options,
    on_event: Channel<Event>,
) -> Result<(), String> {
    state
        .open(
            path,
            options,
            std::sync::Arc::new(move |event| {
                let _ = on_event.send(event);
            }),
        )
        .await
}
#[tauri::command]
async fn native_close(state: State<'_, Backend>, path: String) -> Result<(), String> {
    state.close(&path).await
}
#[tauri::command]
async fn native_write(
    state: State<'_, Backend>,
    path: String,
    data: Vec<u8>,
) -> Result<(), String> {
    state.write(&path, data).await
}
#[tauri::command]
async fn native_set_signals(
    state: State<'_, Backend>,
    path: String,
    signals: OutputSignals,
) -> Result<(), String> {
    state.set_signals(&path, signals).await
}
#[tauri::command]
async fn native_get_signals(
    state: State<'_, Backend>,
    path: String,
) -> Result<InputSignals, String> {
    state.get_signals(&path).await
}
#[tauri::command]
async fn native_send_break(state: State<'_, Backend>, path: String, ms: u64) -> Result<(), String> {
    state.send_break(&path, ms).await
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Backend::default())
        .invoke_handler(tauri::generate_handler![
            native_capabilities,
            native_list,
            native_open,
            native_close,
            native_write,
            native_set_signals,
            native_get_signals,
            native_send_break
        ])
        .run(tauri::generate_context!())
        .expect("SomeTerm startup failed");
}
