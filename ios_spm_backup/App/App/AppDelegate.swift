import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

  var window: UIWindow?

  func application(_ application: UIApplication,
                   didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    print("⚡️ [DEBUG NATIVE] Application lancée")
    return true
  }

  // Deep links (custom URL scheme)
  func application(_ app: UIApplication,
                   open url: URL,
                   options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
    print("⚡️ [DEBUG NATIVE] URL REÇUE: \(url.absoluteString)")
    return CAPBridge.handleOpenUrl(url, options)
  }

  // Universal links
  func application(_ application: UIApplication,
                   continue userActivity: NSUserActivity,
                   restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
    print("⚡️ [DEBUG NATIVE] Universal Link reçu")
    return CAPBridge.handleContinueActivity(userActivity, restorationHandler)
  }

  // ✅ IMPORTANT: forward APNS token to Capacitor (sinon JS ne reçoit jamais "registration")
  func application(_ application: UIApplication,
                   didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    print("🔔 [NATIVE PUSH] ✅ deviceToken: \(deviceToken.map { String(format: "%02.2hhx", $0) }.joined())")
    NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
  }

  func application(_ application: UIApplication,
                   didFailToRegisterForRemoteNotificationsWithError error: Error) {
    print("🔔 [NATIVE PUSH] ❌ failed: \(error.localizedDescription)")
    
    // Forward to Capacitor
    NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
  }
}
