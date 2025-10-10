const { onRequest } = require("firebase-functions/v2/https");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

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
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: displayName,
        });
        await admin.auth().setCustomUserClaims(userRecord.uid, { role: role });
        const userData = {
            nome: nome,
            cognome: cognome,
            email: email,
            role: role,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        if (telefono) {
            userData.telefono = telefono;
        }
        await db.collection("users").doc(userRecord.uid).set(userData);
        logger.info(`Utente ${displayName} (UID: ${userRecord.uid}) creato con successo.`);
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

// --- FUNZIONI DI TIMBRATURA RIPRISTINATE ---

exports.clockEmployeeIn = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Devi essere autenticato.");
    const employeeId = request.auth.uid;
    const { areaId } = request.data;
    if (!areaId) throw new HttpsError("invalid-argument", "L'ID dell'area di lavoro è obbligatorio.");
    
    const activeEntryQuery = await db.collection("time_entries").where("employeeId", "==", employeeId).where("status", "==", "clocked-in").limit(1).get();
    if (!activeEntryQuery.empty) throw new HttpsError("already-exists", "Hai già una timbratura attiva.");

    const employeeDoc = await db.collection("employees").doc(employeeId).get();
    if (!employeeDoc.exists) throw new HttpsError("not-found", "Profilo dipendente non trovato.");
    
    const newEntry = {
        employeeId: employeeId,
        employeeName: `${employeeDoc.data().name} ${employeeDoc.data().surname}`,
        workAreaId: areaId,
        clockInTime: admin.firestore.FieldValue.serverTimestamp(),
        clockOutTime: null,
        status: "clocked-in",
        pauses: [],
    };
    await db.collection("time_entries").add(newEntry);
    logger.info(`Timbratura IN per ${employeeId} nell'area ${areaId}`);
    return { success: true, message: "Timbratura di entrata registrata!" };
});

exports.clockEmployeeOut = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Devi essere autenticato.");
    const employeeId = request.auth.uid;

    const activeEntryQuery = await db.collection("time_entries").where("employeeId", "==", employeeId).where("status", "==", "clocked-in").limit(1).get();
    if (activeEntryQuery.empty) throw new HttpsError("not-found", "Nessuna timbratura attiva trovata.");

    await activeEntryQuery.docs[0].ref.update({
        status: "clocked-out",
        clockOutTime: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info(`Timbratura OUT per ${employeeId}`);
    return { success: true, message: "Timbratura di uscita registrata!" };
});

exports.clockEmployeePause = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Devi essere autenticato.");
    const employeeId = request.auth.uid;

    const activeEntryQuery = await db.collection("time_entries").where("employeeId", "==", employeeId).where("status", "==", "clocked-in").limit(1).get();
    if (activeEntryQuery.empty) throw new HttpsError("not-found", "Nessuna timbratura attiva trovata per la pausa.");

    const entryDoc = activeEntryQuery.docs[0];
    const newPause = { startTime: admin.firestore.FieldValue.serverTimestamp() };
    await entryDoc.ref.update({
        pauses: admin.firestore.FieldValue.arrayUnion(newPause),
    });
    logger.info(`Pausa registrata per ${employeeId}`);
    return { success: true, message: "Pausa registrata con successo!" };
});
