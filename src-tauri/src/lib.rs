#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // Local notifications only. This plugin wraps UNUserNotificationCenter and
    // NotificationCompat — it shows what the app itself creates, while the app
    // is running. It does NOT register with APNs or FCM and receives nothing
    // from a server; see docs/dev/native-notifications.md for why remote push
    // is deliberately not built yet.
    .plugin(tauri_plugin_notification::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
