# Microsoft Authentication Setup Guide

To get Microsoft Login working in your application, you need to link your Firebase project with a Microsoft Azure App Registration.

### Step 1: Enable Microsoft in Firebase
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Select your project.
3. Click on **Authentication** in the left sidebar, then go to the **Sign-in method** tab.
4. Click **Add new provider** and select **Microsoft**.
5. Enable the toggle switch. You will now see that it asks for an **Application ID** and **App Secret**. 
6. Copy the **Callback URL** provided at the bottom of that box (you will need it in Step 2). Keep this Firebase window open.

### Step 2: Create a Microsoft Azure App
1. Go to the [Azure Portal](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade) and sign in.
2. Search for and click on **App registrations**.
3. Click **New registration**.
4. **Name:** Enter a name for your app (e.g., "Xarvis App").
5. **Supported account types:** Choose who can use this application. Usually, you want the third option: *"Accounts in any organizational directory and personal Microsoft accounts (e.g. Skype, Xbox)"* so anyone can log in.
6. **Redirect URI:** Select **Web** from the dropdown, and paste the **Callback URL** you copied from Firebase in Step 1.
7. Click **Register**.

### Step 3: Get your IDs and Secret
1. Once your app is registered, you will be taken to its Overview page.
2. Copy the **Application (client) ID**.
3. Go back to your Firebase Console (from Step 1) and paste it into the **Application ID** field.
4. Back in the Azure Portal, go to **Certificates & secrets** in the left sidebar.
5. Click **New client secret**. Add a description (like "Firebase Auth") and click **Add**.
6. **IMMEDIATELY** copy the **Value** of the newly created secret (it will be hidden if you leave the page).
7. Go back to your Firebase Console and paste it into the **App Secret** field.
8. Click **Save** in Firebase.

Microsoft authentication is now fully set up for your app!

---

# Apple Authentication Setup Guide

1. Go to **Authentication -> Sign-in method** in Firebase and enable **Apple**.
2. You will need a paid **Apple Developer Program** account to generate a **Service ID** and a **Private Key** (.p8 file) from the Apple Developer Console.
3. Follow the Firebase console instructions to map your Apple Service ID and Key to Firebase to enable Apple Sign-in.
