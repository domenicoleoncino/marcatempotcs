const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

exports.createNewUser = onCall(async (request) => {
  
  console.log("Dati ricevuti:", JSON.stringify(request.data));
  console.log("Contesto di autenticazione:", JSON.stringify(request.auth));

  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Devi essere autenticato per creare un utente."
    );
  }
  
  const callingUserDoc = await admin.firestore().collection("users").doc(request.auth.uid).get();
  const callingUserData = callingUserDoc.data();

  if (callingUserData.role !== "admin" && callingUserData.role !== "preposto") {
    throw new HttpsError(
      "permission-denied",
      "Non hai i permessi per creare un utente."
    );
  }

  const { email, password, name, surname, phone, role, managedAreaIds, managedAreaNames } = request.data;

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
    throw new HttpsError("internal", error.message);
  }
});