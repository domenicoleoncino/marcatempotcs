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

        if (role === 'employee') {
            await db.collection("employees").doc(userRecord.uid).set({
                name: nome,
                surname: cognome,
                email: email,
                userId: userRecord.uid,
                workAreaIds: []
            });
        } else {
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
        }

        logger.info(`Utente ${displayName} (UID: ${userRecord.uid}) creato con successo.`);
        res.status(200).send({ success: true, message: `Utente ${displayName} creato con successo.`, uid: userRecord.uid });

    } catch (error) {
        logger.error("Errore durante la creazione dell'utente:", error);
        if (error.code === 'auth/email-already-exists') {
            res.status(409).send({ error: "L'indirizzo email è già in uso." });
        } else {
            res.status(500).send({ error: "Errore interno del server durante la creazione dell'utente." });
        }
    }
});


exports.clockEmployeeIn = onCall(async (request) => {
    const actorUid = request.auth.uid;
    const { targetEmployeeId, areaId, timestamp, note } = request.data;
    const finalEmployeeId = targetEmployeeId || actorUid;

    const actorClaims = request.auth.token;
    const isByAdminOrPreposto = ['admin', 'preposto'].includes(actorClaims.role);

    if (targetEmployeeId && !isByAdminOrPreposto) {
        throw new HttpsError('permission-denied', 'Solo admin o preposti possono timbrare per altri.');
    }
    if (!areaId) {
        throw new HttpsError('invalid-argument', "L'ID dell'area di lavoro è obbligatorio.");
    }
    
    const clockInTime = timestamp ? new Date(timestamp) : new Date();

    const startOfDay = new Date(clockInTime);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(clockInTime);
    endOfDay.setHours(23, 59, 59, 999);

    const existingEntryQuery = await db.collection("time_entries")
        .where("employeeId", "==", finalEmployeeId)
        .where("clockInTime", ">=", startOfDay)
        .where("clockInTime", "<=", endOfDay)
        .limit(1)
        .get();

    if (!existingEntryQuery.empty) {
        throw new HttpsError("already-exists", `Il dipendente ha già una timbratura di entrata per oggi.`);
    }

    const employeeDoc = await db.collection("employees").doc(finalEmployeeId).get();
    if (!employeeDoc.exists) {
        throw new HttpsError("not-found", "Profilo dipendente non trovato.");
    }

    const newEntry = {
        employeeId: finalEmployeeId,
        employeeName: `${employeeDoc.data().name} ${employeeDoc.data().surname}`,
        workAreaId: areaId,
        clockInTime: Timestamp.fromDate(clockInTime),
        clockOutTime: null,
        status: "clocked-in",
        pauses: [],
        createdBy: actorUid,
        note: note || null
    };

    await db.collection("time_entries").add(newEntry);
    logger.info(`Timbratura IN per ${finalEmployeeId} nell'area ${areaId}, eseguita da ${actorUid}`);
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

exports.setEmployeeRole = onCall(async (request) => {
    if (request.auth.token.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Solo un admin può eseguire questa operazione.');
    }
    const { targetUid } = request.data;
    if (!targetUid) {
        throw new HttpsError('invalid-argument', "L'UID del dipendente è obbligatorio.");
    }
    try {
        await admin.auth().setCustomUserClaims(targetUid, { role: 'employee' });
        logger.info(`Ruolo 'employee' assegnato a ${targetUid} da ${request.auth.uid}`);
        return { message: `Ruolo 'employee' assegnato con successo a ${targetUid}` };
    } catch (error) {
        logger.error(`Errore durante l'assegnazione del ruolo a ${targetUid}:`, error);
        throw new HttpsError('internal', `Impossibile impostare il ruolo: ${error.message}`);
    }
});

exports.grantAdminRole = onCall(async (request) => {
    const { targetUid, secret } = request.data;
    const SUPER_SECRET_CODE = "TCSItalia2025!";
    if (secret !== SUPER_SECRET_CODE) {
        throw new HttpsError('permission-denied', 'Codice segreto non valido.');
    }
    try {
        await admin.auth().setCustomUserClaims(targetUid, { role: 'admin' });
        logger.info(`Ruolo 'admin' assegnato a ${targetUid} tramite funzione di emergenza.`);
        return { message: `Ruolo 'admin' assegnato con successo a ${targetUid}` };
    } catch (error) {
        logger.error(`Errore durante l'assegnazione del ruolo admin di emergenza a ${targetUid}:`, error);
        throw new HttpsError('internal', `Impossibile impostare il ruolo: ${error.message}`);
    }
});

exports.resetEmployeeDevice = onCall(async (request) => {
    if (request.auth.token.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Solo un admin può eseguire questa operazione.');
    }
    const { employeeId } = request.data;
    if (!employeeId) {
        throw new HttpsError('invalid-argument', "L'ID del dipendente è obbligatorio.");
    }
    try {
        const employeeRef = db.collection('employees').doc(employeeId);
        await employeeRef.update({ deviceIds: [] });
        logger.info(`Dispositivi resettati per l'impiegato ${employeeId} da ${request.auth.uid}`);
        return { success: true, message: 'Dispositivi resettati con successo.' };
    } catch (error) {
        logger.error(`Errore nel resettare i dispositivi per ${employeeId}:`, error);
        throw new HttpsError('internal', `Impossibile resettare i dispositivi: ${error.message}`);
    }
});

