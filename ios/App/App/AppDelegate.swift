import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        print("⚡️ [DEBUG NATIVE] Application lancée")
        return true
    }

    // --- C'est ici que tout se joue ---
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
        
        // 1. On loggue l'URL reçue pour être sûr qu'iOS fait son travail
        print("⚡️ [DEBUG NATIVE] URL REÇUE: \(url.absoluteString)")
        
        // 2. On passe le relai à Capacitor
        let handled = ApplicationDelegateProxy.shared.application(app, open: url, options: options)
        
        // 3. On loggue le résultat
        print("⚡️ [DEBUG NATIVE] Est-ce que Capacitor a géré l'URL ? -> \(handled)")
        
        return handled
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        print("⚡️ [DEBUG NATIVE] Universal Link reçu")
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // Autres méthodes du cycle de vie (laisse-les vides ou comme avant)
    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}
}
