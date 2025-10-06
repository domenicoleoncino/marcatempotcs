const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onUserDeleted } = require("firebase-functions/v2/auth");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");

admin.initializeApp();
const db = admin.firestore();

// =================================================================================
// FUNZIONE PER CREARE UN NUOVO UTENTE (AGGIORNATA A GEN 2)
// =================================================================================
exports.createNewUser = onCall(async (request) => {
    // Verifica che l'utente che fa la richiesta sia un admin o preposto
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'La funzione può essere chiamata solo da utenti autenticati.');
    }
    const callingUserDoc = await db.collection('users').doc(request.auth.uid).get();
    const callingUserData = callingUserDoc.data();

    if (!callingUserDoc.exists || !['admin', 'preposto'].includes(callingUserData.role)) {
        logger.error("Permesso negato:", { uid: request.auth.uid, role: callingUserData.role });
        throw new HttpsError('permission-denied', 'Solo admin o preposti possono creare nuovi utenti.');
    }

    const { email, password, name, surname, phone, role } = request.data;

    try {
        // 1. Crea l'utente in Authentication
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: `${name} ${surname}`,
        });

        logger.info(`Utente creato in Authentication con UID: ${userRecord.uid}`);

        // 2. Crea il profilo corrispondente in Firestore
        const batch = db.batch();
        if (role === 'employee') {
            const employeeRef = db.collection('employees').doc(userRecord.uid);
            batch.set(employeeRef, {
                userId: userRecord.uid,
                name: name,
                surname: surname,
                email: email,
                phone: phone || '',
                role: 'employee'
            });
        } else { // admin o preposto
            const userRef = db.collection('users').doc(userRecord.uid);
            batch.set(userRef, {
                name: name,
                surname: surname,
                email: email,
                phone: phone || '',
                role: role,
                requiresPasswordChange: true // Forza il cambio password al primo login
            });
            // La funzione 'syncAdminProfileToEmployees' si occuperà di creare il profilo in 'employees'
        }

        await batch.commit();
        logger.info(`Profilo Firestore creato con successo per UID: ${userRecord.uid}`);
        return { success: true, message: `Utente ${name} ${surname} creato con successo.` };

    } catch (error) {
        logger.error("Errore durante la creazione dell'utente:", error);
        throw new HttpsError('internal', `Errore durante la creazione dell'utente: ${error.message}`);
    }
});


// =================================================================================
// FUNZIONE PER CANCELLARE UN UTENTE (AGGIORNATA A GEN 2)
// =================================================================================
exports.deleteUser = onCall(async (request) => {
    // Verifica che chi chiama sia un admin
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'La funzione può essere chiamata solo da utenti autenticati.');
    }
    const callingUserDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!callingUserDoc.exists || callingUserDoc.data().role !== 'admin') {
        throw new HttpsError('permission-denied', 'Solo un admin può eliminare utenti.');
    }

    const uidToDelete = request.data.uid;
    if (!uidToDelete) {
        throw new HttpsError('invalid-argument', 'UID utente non fornito.');
    }

    try {
        await admin.auth().deleteUser(uidToDelete);
        logger.info(`Utente ${uidToDelete} cancellato da Authentication.`);
        // La funzione onUserDeleted si occuperà di pulire Firestore.
        return { success: true, message: "Utente eliminato con successo." };
    } catch (error) {
        logger.error(`Errore durante l'eliminazione dell'utente ${uidToDelete}:`, error);
        throw new HttpsError('internal', error.message);
    }
});

// =================================================================================
// TRIGGER: PULISCE FIRESTORE QUANDO UN UTENTE VIENE CANCELLATO (AGGIORNATO A GEN 2)
// =================================================================================
exports.onUserDeletedCleanup = onUserDeleted(async (event) => {
    const uid = event.data.uid;
    logger.info(`Inizio pulizia Firestore per l'utente cancellato: ${uid}`);

    const batch = db.batch();
    const userDocRef = db.collection('users').doc(uid);
    const employeeDocRef = db.collection('employees').doc(uid);

    batch.delete(userDocRef);
    batch.delete(employeeDocRef);

    try {
        await batch.commit();
        logger.info(`Documenti per l'utente ${uid} cancellati con successo da Firestore.`);
    } catch (error) {
        logger.error(`Errore durante la cancellazione dei documenti per l'utente ${uid}:`, error);
    }
});

// =================================================================================
// TRIGGER: SINCRONIZZA PROFILO ADMIN/PREPOSTO IN EMPLOYEES (AGGIORNATO A GEN 2)
// =================================================================================
exports.syncAdminProfileToEmployees = onDocumentCreated("users/{userId}", (event) => {
    const userData = event.data.data();
    const userId = event.params.userId;

    if (!userData || !['admin', 'preposto'].includes(userData.role)) {
        logger.info(`L'utente ${userId} non è admin/preposto, nessuna azione richiesta.`);
        return null;
    }

    logger.info(`L'utente ${userId} è admin/preposto. Creo il profilo in 'employees'.`);

    const employeeProfile = {
        userId: userId,
        name: userData.name,
        surname: userData.surname,
        email: userData.email,
        phone: userData.phone || '', // Aggiunto per coerenza
        role: userData.role,
        workAreaIds: [], // Inizializza come array vuoto per future assegnazioni
        workAreaNames: [], // Inizializza come array vuoto per future assegnazioni
    };

    // Usa l'UID dell'utente come ID del documento per coerenza
    return db.collection('employees').doc(userId).set(employeeProfile)
        .then(() => {
            logger.info(`Profilo 'employee' per ${userId} creato con successo.`);
            return null;
        })
        .catch(error => {
            logger.error(`Errore durante la creazione del profilo 'employee' per ${userId}:`, error);
            return null;
        });
});