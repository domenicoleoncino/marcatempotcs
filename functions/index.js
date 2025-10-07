const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onUserDeleted } = require("firebase-functions/v2/auth");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { Timestamp } = require("firebase-admin/firestore");

admin.initializeApp();
const db = admin.firestore();

// =================================================================================
// FUNZIONI PER LA TIMBRATURA DEL DIPENDENTE
// =================================================================================

/**
 * Permette a un dipendente autenticato di timbrare l'entrata.
 */
exports.clockEmployeeIn = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Devi essere autenticato.');
    }
    const employeeId = request.auth.uid;
    const { areaId } = request.data;
    if (!areaId) {
        throw new HttpsError('invalid-argument', 'Devi specificare un\'area di lavoro.');
    }

    const activeEntryQuery = await db.collection('time_entries').where('employeeId', '==', employeeId).where('status', '==', 'clocked-in').get();
    if (!activeEntryQuery.empty) {
        throw new HttpsError('already-exists', 'Hai già una timbratura di entrata attiva.');
    }

    const newEntry = {
        employeeId: employeeId,
        workAreaId: areaId,
        clockInTime: Timestamp.now(),
        clockOutTime: null,
        status: 'clocked-in',
        pauses: [],
        createdBy: employeeId
    };

    await db.collection('time_entries').add(newEntry);
    logger.info(`Timbratura entrata per ${employeeId} nell'area ${areaId}`);
    return { success: true, message: 'Entrata registrata con successo.' };
});

/**
 * Permette a un dipendente autenticato di timbrare l'uscita.
 */
exports.clockEmployeeOut = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Devi essere autenticato.');
    }
    const employeeId = request.auth.uid;
    
    const activeEntrySnapshot = await db.collection('time_entries').where('employeeId', '==', employeeId).where('status', '==', 'clocked-in').get();

    if (activeEntrySnapshot.empty) {
        throw new HttpsError('not-found', 'Nessuna timbratura attiva da chiudere.');
    }
    const entryDoc = activeEntrySnapshot.docs[0];
    const entryData = entryDoc.data();

    if (entryData.pauses && entryData.pauses.some(p => !p.end)) {
        throw new HttpsError('failed-precondition', 'Non puoi timbrare l\'uscita mentre sei in pausa.');
    }

    await entryDoc.ref.update({
        status: 'clocked-out',
        clockOutTime: Timestamp.now()
    });
    
    logger.info(`Timbratura uscita per ${employeeId}`);
    return { success: true, message: 'Uscita registrata con successo.' };
});

/**
 * Permette a un dipendente di timbrare una pausa di durata predefinita.
 */
exports.clockEmployeePause = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Devi essere autenticato.');
    }
    const employeeId = request.auth.uid;

    const querySnapshot = await db.collection('time_entries').where('employeeId', '==', employeeId).where('status', '==', 'clocked-in').get();
    if (querySnapshot.empty) {
        throw new HttpsError('not-found', 'Nessuna timbratura attiva trovata.');
    }
    
    const activeEntryDoc = querySnapshot.docs[0];
    const activeEntryData = activeEntryDoc.data();
    const workAreaDoc = await db.collection('work_areas').doc(activeEntryData.workAreaId).get();

    if (!workAreaDoc.exists || !workAreaDoc.data().pauseDuration || workAreaDoc.data().pauseDuration === 0) {
        throw new HttpsError('failed-precondition', 'Nessuna durata di pausa predefinita impostata per questa area di lavoro.');
    }
    const pauseDurationInMinutes = workAreaDoc.data().pauseDuration;
    const currentPauses = activeEntryData.pauses || [];
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + pauseDurationInMinutes * 60000);
    const newPause = {
        start: Timestamp.fromDate(startTime),
        end: Timestamp.fromDate(endTime),
        duration: pauseDurationInMinutes,
        createdBy: employeeId
    };
    await activeEntryDoc.ref.update({ pauses: [...currentPauses, newPause] });
    logger.info(`Pausa di ${pauseDurationInMinutes} min registrata per ${employeeId}`);
    return { success: true, message: `Pausa di ${pauseDurationInMinutes} minuti registrata correttamente.` };
});

// =================================================================================
// FUNZIONI DI GESTIONE UTENTI
// =================================================================================
exports.createNewUser = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'La funzione può essere chiamata solo da utenti autenticati.');
    
    const callingUserDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!callingUserDoc.exists || !['admin', 'preposto'].includes(callingUserDoc.data().role)) {
        throw new HttpsError('permission-denied', 'Solo admin o preposti possono creare nuovi utenti.');
    }

    const { email, password, name, surname, phone, role } = request.data;
    try {
        const userRecord = await admin.auth().createUser({
            email: email, password: password, displayName: `${name} ${surname}`
        });
        const userId = userRecord.uid;
        await admin.auth().setCustomUserClaims(userId, { role: role });
        logger.info(`Utente ${userId} creato e claim '${role}' impostato.`);

        if (role === 'employee') {
            await db.collection('employees').doc(userId).set({
                userId: userId, name: name, surname: surname, email: email,
                phone: phone || '', role: 'employee'
            });
        } else {
            await db.collection('users').doc(userId).set({
                name: name, surname: surname, email: email, phone: phone || '',
                role: role, requiresPasswordChange: true 
            });
        }
        return { success: true, message: `Utente ${name} ${surname} creato con successo.` };
    } catch (error) {
        logger.error("Errore durante la creazione dell'utente:", error);
        throw new HttpsError('internal', `Errore durante la creazione dell'utente: ${error.message}`);
    }
});

exports.deleteUser = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Solo utenti autenticati possono chiamare questa funzione.');
    const callingUserDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!callingUserDoc.exists || callingUserDoc.data().role !== 'admin') {
        throw new HttpsError('permission-denied', 'Solo un admin può eliminare utenti.');
    }
    const uidToDelete = request.data.uid;
    if (!uidToDelete) throw new HttpsError('invalid-argument', 'UID utente non fornito.');

    try {
        await admin.auth().deleteUser(uidToDelete);
        logger.info(`Utente ${uidToDelete} cancellato da Authentication.`);
        return { success: true, message: "Utente eliminato con successo." };
    } catch (error) {
        logger.error(`Errore durante l'eliminazione dell'utente ${uidToDelete}:`, error);
        throw new HttpsError('internal', error.message);
    }
});

exports.onUserDeletedCleanup = onUserDeleted(async (event) => {
    const uid = event.data.uid;
    logger.info(`Inizio pulizia Firestore per l'utente cancellato: ${uid}`);
    const batch = db.batch();
    batch.delete(db.collection('users').doc(uid));
    batch.delete(db.collection('employees').doc(uid));
    try {
        await batch.commit();
        logger.info(`Documenti per l'utente ${uid} cancellati con successo.`);
    } catch (error) {
        logger.error(`Errore durante la cancellazione dei documenti per l'utente ${uid}:`, error);
    }
});

exports.syncAdminProfileToEmployees = onDocumentCreated("users/{userId}", (event) => {
    const userData = event.data.data();
    const userId = event.params.userId;

    if (!userData || !['admin', 'preposto'].includes(userData.role)) {
        return null;
    }
    logger.info(`L'utente ${userId} è admin/preposto. Creo il profilo in 'employees'.`);
    const employeeProfile = {
        userId: userId, name: userData.name, surname: userData.surname, email: userData.email,
        phone: userData.phone || '', role: userData.role, workAreaIds: [], workAreaNames: []
    };
    return db.collection('employees').doc(userId).set(employeeProfile)
        .then(() => logger.info(`Profilo 'employee' per ${userId} creato.`))
        .catch(error => logger.error(`Errore creazione profilo 'employee' per ${userId}:`, error));
});