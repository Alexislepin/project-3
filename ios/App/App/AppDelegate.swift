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

  // (Optionnel) logs APNs token natif — utile pour debug
  func application(_ application: UIApplication,
                   didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    let tokenParts = deviceToken.map { data in String(format: "%02.2hhx", data) }
    let token = tokenParts.joined()
    print("🔔 [NATIVE PUSH] ✅ deviceToken: \(token)")
  }

  func application(_ application: UIApplication,
                   didFailToRegisterForRemoteNotificationsWithError error: Error) {
    print("🔔 [NATIVE PUSH] ❌ failed: \(error.localizedDescription)")
      // ✅ APNs token reçu (log natif visible dans Xcode)
      func application(_ application: UIApplication,
                       didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {

        let tokenParts = deviceToken.map { data in String(format: "%02.2hhx", data) }
        let token = tokenParts.joined()
        print("🔔 [NATIVE PUSH] ✅ deviceToken: \(token)")
      }

      // ❌ Erreur APNs
      func application(_ application: UIApplication,
                       didFailToRegisterForRemoteNotificationsWithError error: Error) {

        print("🔔 [NATIVE PUSH] ❌ failed: \(error.localizedDescription)")
      }

  }
}
