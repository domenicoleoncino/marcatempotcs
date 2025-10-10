const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

// Inizializza l'app di Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// Funzione per creare un utente (inclusa per completezza)
exports.createUser = onCall(async (request) => {
    const { email, password, name, surname, role } = request.data;
    
    // Logica per creare l'utente in Authentication e il documento in Firestore...
    // Assicurati che salvi i dipendenti nella collezione "employees"
    // e gli admin/preposti nella collezione "users".
    
    return { message: "Funzione createUser eseguita." };
});


// Funzione per la timbratura di entrata
exports.clockEmployeeIn = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Devi essere autenticato per timbrare.");
    }
    const employeeId = request.auth.uid;
    const { areaId } = request.data;

    if (!areaId) {
        throw new HttpsError("invalid-argument", "L'ID dell'area di lavoro è obbligatorio.");
    }

    // Controlla se c'è già una timbratura attiva
    const activeEntryQuery = await db.collection("time_entries")
        .where("employeeId", "==", employeeId)
        .where("status", "==", "clocked-in")
        .limit(1)
        .get();

    if (!activeEntryQuery.empty) {
        throw new HttpsError("already-exists", "Hai già una timbratura attiva.");
    }

    // Recupera i dati del dipendente dalla collezione 'employees'
    const employeeDocRef = db.collection("employees").doc(employeeId);
    const employeeDoc = await employeeDocRef.get();
    if (!employeeDoc.exists) {
        throw new HttpsError("not-found", "Profilo dipendente non trovato.");
    }
    const employeeData = employeeDoc.data();
    
    const newEntry = {
        employeeId: employeeId,
        employeeName: `${employeeData.name} ${employeeData.surname}`,
        workAreaId: areaId,
        clockInTime: admin.firestore.FieldValue.serverTimestamp(),
        clockOutTime: null,
        status: "clocked-in",
        pauses: [],
    };

    await db.collection("time_entries").add(newEntry);
    
    logger.info(`Timbratura IN per ${employeeId} nell'area ${areaId}`);
    return { success: true, message: "Timbratura di entrata registrata con successo!" };
});

// Funzione per la timbratura di uscita
exports.clockEmployeeOut = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Devi essere autenticato.");
    }
    const employeeId = request.auth.uid;

    const activeEntryQuery = await db.collection("time_entries")
        .where("employeeId", "==", employeeId)
        .where("status", "==", "clocked-in")
        .limit(1)
        .get();

    if (activeEntryQuery.empty) {
        throw new HttpsError("not-found", "Nessuna timbratura attiva trovata.");
    }

    const entryDoc = activeEntryQuery.docs[0];
    await entryDoc.ref.update({
        status: "clocked-out",
        clockOutTime: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(`Timbratura OUT per ${employeeId}`);
    return { success: true, message: "Timbratura di uscita registrata con successo!" };
});

// Funzione per la timbratura della pausa
exports.clockEmployeePause = onCall(async (request) => {
     if (!request.auth) {
        throw new HttpsError("unauthenticated", "Devi essere autenticato.");
    }
    const employeeId = request.auth.uid;

    const activeEntryQuery = await db.collection("time_entries")
        .where("employeeId", "==", employeeId)
        .where("status", "==", "clocked-in")
        .limit(1)
        .get();

    if (activeEntryQuery.empty) {
        throw new HttpsError("not-found", "Nessuna timbratura attiva trovata per la pausa.");
    }

    const entryDoc = activeEntryQuery.docs[0];
    const newPause = {
        startTime: admin.firestore.FieldValue.serverTimestamp(),
    };

    await entryDoc.ref.update({
        pauses: admin.firestore.FieldValue.arrayUnion(newPause),
    });

    logger.info(`Pausa registrata per ${employeeId}`);
    return { success: true, message: "Pausa registrata con successo!" };
});
