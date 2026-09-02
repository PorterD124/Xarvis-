# Complete Xcode Web App Guide (From Scratch)

This guide provides everything you need to create a brand new iOS App that loads your website, prevents zooming, stops the bouncing effect, manages popup links properly, and is AdSense and App Store compliant. 

### Step 1: Create the Project
1. Open **Xcode** on your Mac.
2. Click **Create a new Xcode project**.
3. Select **iOS** at the top, then choose **App**. Click **Next**.
4. Fill in your project details:
   - **Product Name:** Xarvis (or whatever your app name is)
   - **Interface:** Storyboard (Very important so the code below matches)
   - **Language:** Swift
5. Click **Next** and save the project to your computer.

### Step 2: Add Web Access Permissions
Since your app is loading an external URL, you need to make sure the app permits network connections.
1. In the left panel of Xcode, click on your main project file at the very top (it has a blue icon).
2. Select your Target in the middle pane, then go to the **Info** tab.
3. Hover over the last row in the list and click the **+** button.
4. Type `App Transport Security Settings` and press Enter.
5. Click the little arrow next to it so it points down, then click the **+** button next to it.
6. Type `Allow Arbitrary Loads` and change its value from `NO` to `YES`.

### Step 3: Insert the Code
1. In the left panel, find and click on **ViewController.swift**.
2. Delete everything inside that file.
3. Paste the following complete, compliant code:

```swift
import UIKit
import WebKit

class ViewController: UIViewController, WKUIDelegate, WKNavigationDelegate {
    
    var webView: WKWebView!
    
    // Replace this string with the actual deployed URL of your site!
    let websiteURL = "https://your-deployed-app-url.run.app"
    
    override func loadView() {
        let webConfiguration = WKWebViewConfiguration()
        // Allows inline media playback (important if you have videos/audio)
        webConfiguration.allowsInlineMediaPlayback = true
        
        webView = WKWebView(frame: .zero, configuration: webConfiguration)
        webView.uiDelegate = self
        webView.navigationDelegate = self
        
        // --- APP STORE AND ADSENSE COMPLIANCE RULES ---
        
        // 1. Prevent the bounce/rubber-banding effect (makes it feel like an app, not a website)
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false
        webView.scrollView.alwaysBounceHorizontal = false
        
        // 2. Prevent the user from dragging/zooming the webpage
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = .black // Set to match your app's theme
        
        view = webView
    }
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        guard let myURL = URL(string: websiteURL) else {
            print("Invalid URL")
            return
        }
        
        let myRequest = URLRequest(url: myURL)
        webView.load(myRequest)
        
        // Prevent default pinch gesture on the scroll view
        webView.scrollView.minimumZoomScale = 1.0
        webView.scrollView.maximumZoomScale = 1.0
    }
    
    // --- POPUP AND OAUTH HANDLING ---
    
    // This allows target="_blank" links (like Google/Microsoft Auth popups) to open correctly within the WebView 
    // instead of escaping out to Safari and breaking the flow.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil {
            // It's a popup or a new window link. We force it to load in the current webview.
            webView.load(navigationAction.request)
        }
        return nil
    }
}
```

### Step 4: Add WKUIDelegate (Optional but Recommended)
If your website uses JavaScript alerts (`alert()`), you must handle them in Swift, otherwise they will silently fail. Replace your `WKUIDelegate` functions as follows by adding this into your `ViewController` class:

```swift
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default, handler: { _ in
            completionHandler()
        }))
        self.present(alert, animated: true, completion: nil)
    }
```

### Step 5: Test and Build
1. Change the URL in `websiteURL` to point to your live URL.
2. Select an iPhone Simulator from the top toolbar.
3. Click the Play button (Run) in the top left corner (Cmd + R).

The website will load seamlessly as an app, without bouncing or zooming, and keep out-of-app popups confined to the webview!
