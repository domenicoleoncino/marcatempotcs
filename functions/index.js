const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.createNewUser = functions.https.onCall(async (data, context) => {
  
  // MODIFICA: Aggiungiamo i log per il debug
  console.log("Dati ricevuti:", JSON.stringify(data));
  console.log("Contesto di autenticazione:", JSON.stringify(context.auth));

  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Devi essere autenticato per creare un utente."
    );
  }
  
  const callingUserDoc = await admin.firestore().collection("users").doc(context.auth.uid).get();
  const callingUserData = callingUserDoc.data();

  if (callingUserData.role !== "admin" && callingUserData.role !== "preposto") {
     throw new functions.https.HttpsError(
      "permission-denied",
      "Non hai i permessi per creare un utente."
    );
  }

  const { email, password, name, surname, phone, role, managedAreaIds, managedAreaNames } = data;

  try {
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: `${name} ${surname}`,
    });

    await admin.firestore().collection("users").doc(userRecord.uid).set({
        name: name,
        surname: surname,
        email: email,
        role: role,
        requiresPasswordChange: true,
        managedAreaIds: managedAreaIds || null,
        managedAreaNames: managedAreaNames || null,
    });

    if (role === "employee") {
        await admin.firestore().collection("employees").add({
            userId: userRecord.uid,
            name: name,
            surname: surname,
            phone: phone || "",
            email: email,
            workAreaIds: managedAreaIds || [],
            workAreaNames: managedAreaNames || [],
            deviceIds: []
        });
    }

    return { result: `Utente ${email} creato con successo.` };

  } catch (error) {
    console.error("Errore durante la creazione dell'utente:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});