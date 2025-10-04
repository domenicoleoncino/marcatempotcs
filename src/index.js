const admin = require("firebase-admin");
admin.initializeApp();

// ========================================================================
// ========= NUOVA FUNZIONE: Sincronizza Admin/Preposti su Employees ======
// ========================================================================
/**
 * Si attiva automaticamente quando un nuovo documento viene creato
 * nella collezione 'users'.
 * Se il nuovo utente è un 'admin' o 'preposto', crea automaticamente
 * un profilo corrispondente nella collezione 'employees' per permettergli di timbrare.
 */
exports.syncAdminProfileToEmployees = functions.firestore
  .document("users/{userId}")
  .onCreate(async (snap, context) => {
    const newUserProfile = snap.data();
    const userId = context.params.userId; // Questo è l'UID dell'utente

    // Controlla se il nuovo utente è un admin o un preposto
    if (newUserProfile.role === "admin" || newUserProfile.role === "preposto") {
      console.log(
        `Nuovo ${newUserProfile.role} rilevato: ${userId}. Creo il profilo dipendente...`
      );

      const employeeProfile = {
        // Copia i dati rilevanti dal profilo 'users'
        name: newUserProfile.name,
        surname: newUserProfile.surname,
        email: newUserProfile.email,
        // Questo è il campo chiave che lega il profilo employee all'utente autenticato
        userId: userId,
        // Puoi impostare qui altri campi di default se necessario
        status: "non_attivo",
        workAreaIds: [], // Inizializza con un array vuoto
      };

      try {
        // Crea il documento nella collezione 'employees' usando lo stesso UID come ID
        await admin.firestore().collection("employees").doc(userId).set(employeeProfile);
        console.log(
          `Profilo dipendente per ${userId} creato con successo.`
        );
      } catch (error) {
        console.error(
          `Errore durante la creazione del profilo dipendente per ${userId}:`,
          error
        );
      }
    }
    return null; // La funzione termina qui
  });


// ========================================================================
// ========= FUNZIONI DI CANCELLAZIONE (già esistenti) ====================
// ========================================================================

/**
 * Funzione invocabile dall'app per cancellare un utente.
 * Esegue un controllo per assicurarsi che solo un admin possa eseguire questa azione.
 * Cancella l'utente da Firebase Authentication.
 */
exports.deleteUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Devi essere autenticato per eseguire questa operazione."
    );
  }

  const callerUid = context.auth.uid;
  const callerDoc = await admin.firestore().collection("users").doc(callerUid).get(); // Cerca in 'users'

  if (!callerDoc.exists || callerDoc.data().role !== "admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Non hai i permessi per cancellare un utente."
    );
  }

  const uidToDelete = data.uid;
  if (!uidToDelete) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "L'UID dell'utente da cancellare non è stato fornito."
    );
  }

  try {
    await admin.auth().deleteUser(uidToDelete);
    console.log(`Utente ${uidToDelete} cancellato con successo da Authentication.`);
    // Non serve cancellare da Firestore qui, la funzione qui sotto lo farà
    return { success: true, message: "Utente cancellato con successo." };
  } catch (error) {
    console.error("Errore durante la cancellazione dell'utente:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Si è verificato un errore durante la cancellazione dell'utente."
    );
  }
});

/**
 * Funzione trigger che si attiva automaticamente quando un utente
 * viene cancellato da Authentication.
 * Cancella i documenti corrispondenti da 'users' e 'employees' per mantenere i dati allineati.
 */
exports.onUserDeleted = functions.auth.user().onDelete(async (user) => {
  const uid = user.uid;
  const db = admin.firestore();
  const userDocRef = db.collection("users").doc(uid);
  const employeeDocRef = db.collection("employees").doc(uid);

  try {
    // Crea una batch per cancellare entrambi i documenti in una sola operazione
    const batch = db.batch();
    batch.delete(userDocRef);
    batch.delete(employeeDocRef);
    await batch.commit();

    console.log(`Documenti per l'utente ${uid} cancellati con successo da Firestore.`);
  } catch (error) {
    console.error(`Errore durante la cancellazione dei documenti per l'utente ${uid}:`, error);
  }
});

