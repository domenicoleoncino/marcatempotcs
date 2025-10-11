const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Funzione per creare un nuovo utente (Admin, Preposto o Dipendente)
exports.createNewUser = onRequest({ cors: true }, async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send({ error: 'Method Not Allowed' });
    }
    try {
        const { email, password, nome, cognome, role, telefono } = req.body;
        if (!email || !password || !nome || !cognome || !role) {
            logger.error("Dati mancanti per la creazione utente", req.body);
            return res.status(400).send({ error: "Tutti i campi obbligatori (nome, cognome, email, password, ruolo) devono essere forniti." });
        }
        
        const displayName = `${nome} ${cognome}`;

        // 1. Crea l'utente in Authentication
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: displayName,
        });

        // 2. Imposta il ruolo ("carta d'identità")
        await admin.auth().setCustomUserClaims(userRecord.uid, { role: role });

        // 3. Salva il profilo nel database corretto
        if (role === 'admin' || role === 'preposto') {
            const userData = { nome, cognome, email, role, createdAt: admin.firestore.FieldValue.serverTimestamp() };
            if (telefono) userData.telefono = telefono;
            await db.collection("users").doc(userRecord.uid).set(userData);
        } else { // 'employee'
            await db.collection("employees").doc(userRecord.uid).set({
                name: nome,
                surname: cognome,
                email: email,
                userId: userRecord.uid, // Associa l'UID auth al profilo
                workAreaIds: []
            });
        }

        logger.info(`Utente ${displayName} (UID: ${userRecord.uid}) creato con ruolo ${role}.`);
        res.status(200).send({ success: true, message: `Utente ${displayName} creato con successo.`, uid: userRecord.uid });

    } catch (error) {
        logger.error("Errore durante la creazione dell'utente:", error);
        if (error.code === 'auth/email-already-exists') {
            res.status(409).send({ error: "L'indirizzo email è già in uso." });
        } else {
            res.status(500).send({ error: "Errore interno del server." });
        }
    }
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

    const activeEntryQuery = await db.collection("time_entries")
        .where("employeeId", "==", employeeId)
        .where("status", "==", "clocked-in")
        .limit(1)
        .get();

    if (!activeEntryQuery.empty) {
        throw new HttpsError("already-exists", "Hai già una timbratura attiva.");
    }

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


// ===================================================================
// ## FUNZIONE DI MANUTENZIONE PER CORREGGERE I RUOLI ##
// ===================================================================
exports.setEmployeeRole = onCall(async (request) => {
    // 1. Controlla che chi chiama sia un Admin
    if (request.auth?.token.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Solo gli admin possono eseguire questa operazione.');
    }

    // 2. Prendi l'UID del dipendente da correggere
    const { targetUid } = request.data;
    if (!targetUid) {
        throw new HttpsError('invalid-argument', "È necessario fornire l'UID dell'utente da correggere.");
    }

    try {
        // 3. Imposta la "carta d'identità" corretta
        await admin.auth().setCustomUserClaims(targetUid, { role: 'employee' });
        logger.info(`Ruolo 'employee' impostato correttamente per l'utente ${targetUid} dall'admin ${request.auth.uid}`);
        return { success: true, message: `Ruolo impostato a 'employee' per l'utente ${targetUid}.` };
    } catch (error) {
        logger.error(`Errore nell'impostare il ruolo per ${targetUid}:`, error);
        throw new HttpsError('internal', "Si è verificato un errore durante l'aggiornamento del ruolo.");
    }
});

