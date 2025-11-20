// File: functions/src/index.js (VERSIONE DEFINITIVA COMPLETA)

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { Timestamp, GeoPoint, FieldValue } = require("firebase-admin/firestore");
const { zonedTimeToUtc } = require('date-fns-tz');

admin.initializeApp();
const db = admin.firestore();

// --- Funzione Helper Arrotondamento Server-side ---
function roundTimeWithCustomRulesServer(date, type) {
    const newDate = new Date(date.getTime());
    const minutes = newDate.getMinutes();
    if (type === 'entrata') {
        if (minutes >= 46) { newDate.setHours(newDate.getHours() + 1); newDate.setMinutes(0); }
        else if (minutes >= 16) { newDate.setMinutes(30); }
        else { newDate.setMinutes(0); }
    } else if (type === 'uscita') {
        if (minutes >= 30) { newDate.setMinutes(30); }
        else { newDate.setMinutes(0); }
    }
    newDate.setSeconds(0, 0); // Pulisce secondi e millisecondi
    return newDate;
}

// --- Funzione Helper Calcolo Distanza (Haversine) ---
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Metri
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distanza in metri
}


// ===============================================
// --- Funzione Creazione Utente (con flag mustChangePassword) ---
// ===============================================
exports.createUser = functions.region('europe-west1').https.onCall(async (data, context) => {
    // Controllo ruolo Admin
    if (context.auth?.token.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Solo un amministratore può creare nuovi utenti.');
    }
    // Validazione input base
    const { email, password, name, surname, role } = data;
    if (!email || !password || !name || !surname || !role) {
        throw new functions.https.HttpsError('invalid-argument', 'Email, password, nome, cognome e ruolo sono obbligatori.');
    }
    if (!['dipendente', 'preposto', 'admin'].includes(role)) {
        throw new functions.https.HttpsError('invalid-argument', `Ruolo "${role}" non valido.`);
    }

    try {
        // Crea utente in Firebase Auth
        const userRecord = await admin.auth().createUser({ email, password, displayName: `${name} ${surname}` });
        // Imposta Custom Claim per il ruolo
        await admin.auth().setCustomUserClaims(userRecord.uid, { role });

        // Crea documento in Firestore 'users'
        await db.collection('users').doc(userRecord.uid).set({
            name, surname, email, role,
            phone: data.phone || null,
            createdAt: FieldValue.serverTimestamp(),
            mustChangePassword: true 
        });

        // Se è dipendente o preposto, crea anche documento in 'employees'
        if (role === 'dipendente' || role === 'preposto') {
            await db.collection('employees').add({
                userId: userRecord.uid, name, surname, email,
                workAreaIds: [], deviceIds: [],
                createdAt: FieldValue.serverTimestamp()
            });
        }
        return { success: true, message: `Utente ${email} (${role}) creato con successo.` };
    } catch (error) {
        if (error.code === 'auth/email-already-exists') {
            throw new functions.https.HttpsError('already-exists', 'Questa email è già registrata.');
        }
        throw new functions.https.HttpsError('internal', `Errore del server: ${error.message}`);
    }
});

// ===============================================
// --- Funzione Eliminazione Utente e Dipendente ---
// ===============================================
exports.deleteUserAndEmployee = functions.region('europe-west1').https.onCall(async (data, context) => {
    if (context.auth?.token.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Solo un amministratore può eliminare utenti.');
    }
    const { userId } = data;
    if (!userId) {
        throw new functions.https.HttpsError('invalid-argument', 'L\'UID dell\'utente da eliminare è obbligatorio.');
    }

    try {
        await admin.auth().deleteUser(userId);
        await db.collection('users').doc(userId).delete();
        const employeeQuery = await db.collection('employees').where('userId', '==', userId).limit(1).get();
        if (!employeeQuery.empty) {
            await employeeQuery.docs[0].ref.delete();
        }
        return { success: true, message: `Utente ${userId} e dati associati eliminati.` };
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
             try {
                 await db.collection('users').doc(userId).delete();
                 const employeeQuery = await db.collection('employees').where('userId', '==', userId).limit(1).get();
                 if (!employeeQuery.empty) await employeeQuery.docs[0].ref.delete();
                 return { success: true, message: `Dati Firestore per utente ${userId} eliminati (utente Auth non trovato).` };
             } catch (cleanupError) {
                 throw new functions.https.HttpsError('internal', `Utente Auth non trovato e errore durante pulizia dati Firestore: ${cleanupError.message}`);
             }
        }
        throw new functions.https.HttpsError('internal', `Errore server durante eliminazione: ${error.message}`);
    }
});

// ===============================================
// --- Funzione Creazione Area di Lavoro ---
// ===============================================
exports.createWorkArea = functions.region('europe-west1').https.onCall(async (data, context) => {
    if (context.auth?.token.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Solo un amministratore può creare aree.');
    }
    const { name, latitude, longitude, radius, pauseDuration } = data;
    if (!name || latitude == null || longitude == null || radius == null) { 
        throw new functions.https.HttpsError('invalid-argument', 'Nome, Latitudine, Longitudine e Raggio sono obbligatori.');
    }
    const lat = Number(latitude);
    const lon = Number(longitude);
    const rad = Number(radius);
    const pause = Number(pauseDuration || 0); 

    if (isNaN(lat) || isNaN(lon) || isNaN(rad) || rad <= 0 || isNaN(pause) || pause < 0) {
       throw new functions.https.HttpsError('invalid-argument', 'Latitudine, Longitudine devono essere numeri validi. Raggio > 0. Pausa >= 0.');
    }

    try {
        const location = new GeoPoint(lat, lon);
        await db.collection("work_areas").add({
            name,
            pauseDuration: pause,
            location, 
            latitude: lat, 
            longitude: lon, 
            radius: rad, 
            createdAt: FieldValue.serverTimestamp() 
        });
        return { success: true, message: `Area "${name}" creata.` };
    } catch (error) {
        throw new functions.https.HttpsError('internal', `Errore server durante la creazione dell'area: ${error.message}`);
    }
});

// ===============================================
// --- Funzioni Timbratura Manuale (Admin/Preposto) ---
// ===============================================
exports.manualClockIn = functions.region('europe-west1').https.onCall(async (data, context) => {
    
    const callerUid = context.auth?.uid;
    const callerRole = context.auth?.token.role;

    if (!callerUid || (callerRole !== 'admin' && callerRole !== 'preposto')) {
        throw new functions.https.HttpsError('permission-denied', 'Azione non permessa. Richiesto ruolo Admin/Preposto.');
    }
    
    const { employeeId, workAreaId, timestamp, adminId, timezone, note } = data; 
    
    if (!employeeId || !workAreaId || !timestamp || !adminId || !timezone) { 
        throw new functions.https.HttpsError('invalid-argument', 'Dati obbligatori mancanti (employeeId, workAreaId, timestamp, adminId, timezone).');
    }

    let clockInDateUTC;
    try {
        clockInDateUTC = zonedTimeToUtc(timestamp, timezone);
        if (isNaN(clockInDateUTC.getTime())) { 
           throw new Error('Data non valida generata da zonedTimeToUtc');
        }
    } catch (tzError) {
        throw new functions.https.HttpsError('invalid-argument', `Timestamp o timezone non validi: ${tzError.message}`);
    }

    try {
        // Controlla se il dipendente ha già una timbratura attiva
        const activeEntryQuery = await db.collection('time_entries')
            .where('employeeId', '==', employeeId)
            .where('status', '==', 'clocked-in')
            .limit(1).get();
        if (!activeEntryQuery.empty) {
            const activeEntryTime = activeEntryQuery.docs[0].data().clockInTime.toDate().toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
            throw new functions.https.HttpsError('failed-precondition', `Il dipendente ha già una timbratura attiva dal ${activeEntryTime}.`);
        }
        
        const roundedClockInTime = roundTimeWithCustomRulesServer(clockInDateUTC, 'entrata');
        
        await db.collection('time_entries').add({
            employeeId,
            workAreaId,
            clockInTime: Timestamp.fromDate(roundedClockInTime),
            clockOutTime: null,
            status: 'clocked-in',
            createdBy: adminId, 
            pauses: [],
            isManual: true, 
            note: note || 'N/D', 
            createdAt: FieldValue.serverTimestamp(),
            timezoneUsed: timezone 
        });
        return { success: true, message: "Timbratura di entrata manuale registrata." };
    } catch (error) {
        if (error.code && error.code.startsWith('functions')) throw error;
        throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
    }
});

exports.manualClockOut = functions.region('europe-west1').https.onCall(async (data, context) => {
    const callerUid = context.auth?.uid;
    const callerRole = context.auth?.token.role;
    if (!callerUid || (callerRole !== 'admin' && callerRole !== 'preposto')) {
        throw new functions.https.HttpsError('permission-denied', 'Azione non permessa.');
    }
    const { employeeId, timestamp, adminId, timezone, entryId, note } = data;
    if (!employeeId || !timestamp || !adminId || !timezone || !entryId) { 
        throw new functions.https.HttpsError('invalid-argument', 'Dati obbligatori mancanti (employeeId, entryId, timestamp, adminId, timezone).');
    }

    let clockOutDateUTC;
     try {
        clockOutDateUTC = zonedTimeToUtc(timestamp, timezone);
         if (isNaN(clockOutDateUTC.getTime())) {
           throw new Error('Data non valida generata da zonedTimeToUtc');
        }
    } catch (tzError) {
        throw new functions.https.HttpsError('invalid-argument', `Timestamp o timezone non validi: ${tzError.message}`);
    }

    try {
        const entryRef = db.collection('time_entries').doc(entryId);
        const entryDoc = await entryRef.get();
        
        if (!entryDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Timbratura non trovata. ID fornito non valido.');
        }
        
        const entryData = entryDoc.data();

        if (entryData.employeeId !== employeeId || entryData.status !== 'clocked-in') {
             throw new functions.https.HttpsError('failed-precondition', 'La timbratura trovata non è attiva o non corrisponde al dipendente.');
        }
        
        if (entryData.clockInTime.toDate() >= clockOutDateUTC) {
            throw new functions.https.HttpsError('invalid-argument', `L'orario di uscita deve essere successivo all'entrata.`);
        }
        const isInPause = (entryData.pauses || []).some(p => p.start && !p.end);
        if (isInPause) {
            throw new functions.https.HttpsError('failed-precondition', 'Il dipendente è attualmente in pausa. Terminare la pausa prima di timbrare l\'uscita.');
        }

        const roundedClockOutTime = roundTimeWithCustomRulesServer(clockOutDateUTC, 'uscita');
        
        await entryDoc.ref.update({
            clockOutTime: Timestamp.fromDate(roundedClockOutTime),
            status: 'clocked-out',
            lastModifiedBy: adminId, 
            isManualExit: true, 
            note: note || 'N/D', 
            lastModifiedAt: FieldValue.serverTimestamp(),
            timezoneUsed: timezone 
        });
        return { success: true, message: "Timbratura di uscita manuale registrata." };
    } catch (error) {
        if (error.code && error.code.startsWith('functions')) throw error;
        throw new functions.https.HttpsError('internal', `Errore server durante eliminazione: ${error.message}`);
    }
});


// ===============================================
// --- Funzioni Pausa (Preposto/Dipendente per Sé) ---
// ===============================================
exports.prepostoTogglePause = functions.region('europe-west1').https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    const callerRole = context.auth?.token.role;
    // Permesso per Dipendenti e Preposti
    if (!uid || (callerRole !== 'preposto' && callerRole !== 'dipendente')) {
        throw new functions.https.HttpsError('permission-denied', 'Azione riservata a dipendenti e preposti.');
    }

    try {
        // Trova profilo employee del chiamante
        const employeeQuery = await db.collection('employees').where('userId', '==', uid).limit(1).get();
        if (employeeQuery.empty) {
            throw new functions.https.HttpsError('not-found', 'Profilo dipendente non trovato.');
        }
        const employeeId = employeeQuery.docs[0].id;

        // Trova timbratura attiva del chiamante
        const q = db.collection('time_entries')
            .where('employeeId', '==', employeeId)
            .where('status', '==', 'clocked-in')
            .limit(1);
        const snapshot = await q.get();
        if (snapshot.empty) {
            throw new functions.https.HttpsError('not-found', 'Nessuna timbratura attiva trovata.');
        }
        const entryRef = snapshot.docs[0].ref;
        const currentPauses = snapshot.docs[0].data().pauses || [];
        const now = Timestamp.now();

        // Trova indice pausa attiva (se esiste)
        const activePauseIndex = currentPauses.findIndex(p => p.start && !p.end);

        if (activePauseIndex !== -1) { // Se in pausa -> termina
            currentPauses[activePauseIndex].end = now;
            await entryRef.update({ pauses: currentPauses });
            return { success: true, message: `Pausa terminata.` };
        } else { // Se non in pausa -> inizia (pausa manuale)
            currentPauses.push({ start: now, end: null, createdBy: uid, isAutomatic: false });
            await entryRef.update({ pauses: currentPauses });
            return { success: true, message: `Pausa iniziata.` };
        }
    } catch (error) {
        if (error.code && error.code.startsWith('functions')) throw error;
        throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
    }
});

// ===============================================
// --- Funzione Assegnazione Aree (Preposto per Dipendente) ---
// ===============================================
exports.prepostoAssignEmployeeToArea = functions.region('europe-west1').https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    const callerRole = context.auth?.token.role;
    if (!uid || callerRole !== 'preposto') {
        throw new functions.https.HttpsError('permission-denied', 'Azione riservata ai preposti.');
    }
    const { employeeId, areaIds } = data; 
    if (!employeeId || !Array.isArray(areaIds)) {
        throw new functions.https.HttpsError('invalid-argument', 'Dati mancanti o non validi (employeeId, areaIds).');
    }

    try {
        const prepostoUserDoc = await db.collection('users').doc(uid).get();
        if (!prepostoUserDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Profilo utente del preposto non trovato.');
        }
        const managedAreaIds = prepostoUserDoc.data().managedAreaIds || [];
        if (managedAreaIds.length === 0) {
            throw new functions.https.HttpsError('permission-denied', 'Non risulti gestire alcuna area. Contatta un amministratore.');
        }

        const isAllowed = areaIds.every(id => managedAreaIds.includes(id));
        if (!isAllowed) {
            throw new functions.https.HttpsError('permission-denied', 'Stai cercando di assegnare aree che non gestisci.');
        }

        const employeeRef = db.collection('employees').doc(employeeId);
        const employeeDoc = await employeeRef.get();
        if (!employeeDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Dipendente selezionato non trovato.');
        }
        const currentWorkAreaIds = employeeDoc.data().workAreaIds || [];

        const otherAreaIds = currentWorkAreaIds.filter(id => !managedAreaIds.includes(id));
        const finalAreaIds = [...new Set([...otherAreaIds, ...areaIds])];

        await employeeRef.update({
            workAreaIds: finalAreaIds,
            lastModifiedBy: uid, 
            lastModifiedAt: FieldValue.serverTimestamp()
        });

        return { success: true, message: `Aree di competenza aggiornate per il dipendente.` };
    } catch (error) {
        if (error.code && error.code.startsWith('functions')) throw error;
        throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
    }
});


// ===============================================
// --- Funzione: Applica Pausa Automatica (Admin/Preposto) ---
// ===============================================
exports.applyAutoPauseEmployee = functions.region('europe-west1').https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    const callerRole = context.auth?.token.role; 

    if (!uid || (callerRole !== 'admin' && callerRole !== 'preposto')) { 
        throw new functions.https.HttpsError('permission-denied', 'Azione riservata a personale amministrativo.');
    }

    const { timeEntryId, durationMinutes } = data; 
    if (!timeEntryId || typeof durationMinutes !== 'number' || durationMinutes <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'ID timbratura o durata pausa non validi.');
    }

    try {
        const entryRef = db.collection('time_entries').doc(timeEntryId);
        const entryDoc = await entryRef.get();
        
        if (!entryDoc.exists || entryDoc.data().status !== 'clocked-in') {
            throw new functions.https.HttpsError('not-found', 'Nessuna timbratura attiva trovata per applicare la pausa.');
        }
        const entryData = entryDoc.data();
        const currentPauses = entryData.pauses || [];

        const isAlreadyInPause = currentPauses.some(p => p.start && !p.end);
        if (isAlreadyInPause) {
             throw new functions.https.HttpsError('failed-precondition', 'Il dipendente è già in pausa.');
        }
        
        const hasExistingAutoPause = currentPauses.some(p => p.isAutomatic && p.start && p.end && p.durationMinutes === durationMinutes);
        if (hasExistingAutoPause) {
             throw new functions.https.HttpsError('failed-precondition', 'Una pausa automatica di questa durata è stata già applicata in questa sessione.');
        }

        const startTime = new Date(); 
        const endTime = new Date(startTime.getTime() + durationMinutes * 60000); 

        const newPause = {
            start: Timestamp.fromDate(startTime),
            end: Timestamp.fromDate(endTime), 
            durationMinutes: durationMinutes,
            createdBy: uid, 
            isAutomatic: true 
        };

        await entryRef.update({
            pauses: FieldValue.arrayUnion(newPause)
        });

        return { success: true, message: `Pausa automatica di ${durationMinutes} minuti applicata.` };

    } catch (error) {
        if (error.code && error.code.startsWith('functions')) throw error;
        throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
    }
});

// ===============================================
// --- Funzioni Timbratura Dipendente (usate da EmployeeDashboard) ---
// ===============================================
exports.clockEmployeeIn = functions.region('europe-west1').https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    const callerRole = context.auth?.token.role;
    if (!uid || (callerRole !== 'dipendente' && callerRole !== 'preposto')) { 
        throw new functions.https.HttpsError('permission-denied', 'Azione non permessa.');
    }
    const { areaId, deviceId, currentLat, currentLon, isGpsRequired } = data;
    if (!areaId || isGpsRequired == null || typeof isGpsRequired !== 'boolean' || !deviceId) { 
        throw new functions.https.HttpsError('invalid-argument', 'Dati obbligatori (Area ID, GPS status, Device ID) mancanti.');
    }

    try {
        // Trova profilo employee
        const employeeQuery = await db.collection('employees').where('userId', '==', uid).limit(1).get();
        if (employeeQuery.empty) {
            throw new functions.https.HttpsError('not-found', 'Profilo dipendente non trovato.');
        }
        const employeeDoc = employeeQuery.docs[0];
        const employeeId = employeeDoc.id;
        const employeeRef = employeeDoc.ref;
        
        // === LOGICA REGISTRAZIONE DISPOSITIVO (LIMITE 2 DISPOSITIVI) ===
        const MAX_DEVICES = 2;
        const currentDeviceIds = employeeDoc.data().deviceIds || [];

        if (!currentDeviceIds.includes(deviceId)) {
            if (currentDeviceIds.length < MAX_DEVICES) {
                // Registra il nuovo dispositivo
                await employeeRef.update({
                    deviceIds: FieldValue.arrayUnion(deviceId)
                });
            } else {
                // Blocca se il limite è stato raggiunto e il dispositivo non è registrato
                const errorMessage = `Accesso BLOCCATO. Hai raggiunto il limite massimo di ${MAX_DEVICES} dispositivi registrati. Contatta l'Amministrazione per effettuare il Reset del Dispositivo.`;
                throw new functions.https.HttpsError('permission-denied', errorMessage);
            }
        }
        // ====================================================

         // Controlla timbratura attiva
         const activeEntryQuery = await db.collection('time_entries').where('employeeId', '==', employeeId).where('status', '==', 'clocked-in').limit(1).get();
         if (!activeEntryQuery.empty) {
             throw new functions.https.HttpsError('failed-precondition', `Timbratura già attiva.`);
         }

         // === CONTROLLO GPS/GEOFENCE ===
         if (isGpsRequired) {
             const areaDoc = await db.collection('work_areas').doc(areaId).get();
             if (!areaDoc.exists) {
                 throw new functions.https.HttpsError('not-found', 'Area di lavoro non trovata.');
             }
             const areaData = areaDoc.data();
             const areaLat = areaData.latitude;
             const areaLon = areaData.longitude;
             const areaRadius = areaData.radius;

             if (currentLat == null || currentLon == null) {
                  throw new functions.https.HttpsError('failed-precondition', 'Posizione GPS non disponibile per la timbratura.');
             }

             const distance = getDistance(currentLat, currentLon, areaLat, areaLon);
             if (distance > areaRadius) {
                 throw new functions.https.HttpsError('failed-precondition', `Non sei nel raggio dell'area (${areaDoc.data().name}). Distanza: ${Math.round(distance)}m`);
             }
         }
         // ==============================
         
         const now = new Date();
         const roundedClockInTime = roundTimeWithCustomRulesServer(now, 'entrata');
         
         const clockInLocation = (currentLat != null && currentLon != null) 
                                 ? new GeoPoint(currentLat, currentLon) 
                                 : null;
                                 
         await db.collection('time_entries').add({
             employeeId,
             workAreaId: areaId,
             clockInTime: Timestamp.fromDate(roundedClockInTime),
             clockInLocation,
             clockOutTime: null,
             status: 'clocked-in',
             createdBy: uid, 
             pauses: [],
             createdAt: FieldValue.serverTimestamp() 
         });
         return { success: true, message: "Timbratura di entrata registrata." };
       } catch (error) {
           if (error.code && error.code.startsWith('functions')) throw error;
           throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
       }
});

exports.clockEmployeeOut = functions.region('europe-west1').https.onCall(async (data, context) => {
     const uid = context.auth?.uid;
     const callerRole = context.auth?.token.role;
     if (!uid || (callerRole !== 'dipendente' && callerRole !== 'preposto')) {
          throw new functions.https.HttpsError('permission-denied', 'Azione non permessa.');
     }
     const { currentLat, currentLon, isGpsRequired } = data; 
     
     if (isGpsRequired == null || typeof isGpsRequired !== 'boolean') {
          throw new functions.https.HttpsError('invalid-argument', 'Stato GPS mancante.');
     }

     try {
          const employeeQuery = await db.collection('employees').where('userId', '==', uid).limit(1).get();
          if (employeeQuery.empty) {
               throw new functions.https.HttpsError('not-found', 'Profilo dipendente non trovato.');
          }
          const employeeId = employeeQuery.docs[0].id;

          const q = db.collection('time_entries').where('employeeId', '==', employeeId).where('status', '==', 'clocked-in').limit(1);
          const snapshot = await q.get();
          if (snapshot.empty) {
               throw new functions.https.HttpsError('not-found', 'Nessuna timbratura attiva trovata.');
          }
          const entryDoc = snapshot.docs[0];
          const entryData = entryDoc.data();
          const workAreaId = entryData.workAreaId;

          // === CONTROLLO GPS/GEOFENCE PER L'USCITA ===
          if (isGpsRequired && workAreaId) {
             const areaDoc = await db.collection('work_areas').doc(workAreaId).get();
             if (!areaDoc.exists) {
                 throw new functions.https.HttpsError('not-found', 'Area di lavoro associata non trovata.');
             }
             const areaData = areaDoc.data();
             const areaLat = areaData.latitude;
             const areaLon = areaData.longitude;
             const areaRadius = areaData.radius;

             if (currentLat == null || currentLon == null) {
                  throw new functions.https.HttpsError('failed-precondition', 'Posizione GPS non disponibile per la timbratura.');
             }

             const distance = getDistance(currentLat, currentLon, areaLat, areaLon);
             if (distance > areaRadius) {
                 throw new functions.https.HttpsError('failed-precondition', `Non sei nel raggio dell'area (${areaDoc.data().name}) per l'uscita. Distanza: ${Math.round(distance)}m`);
             }
          }
          // ===========================================

          const isInPause = (entryData.pauses || []).some(p => p.start && !p.end);
          if (isInPause) {
               throw new functions.https.HttpsError('failed-precondition', 'Terminare la pausa prima di timbrare l\'uscita.');
          }

          const now = new Date();
          if (entryData.clockInTime.toDate() >= now) {
               throw new functions.https.HttpsError('invalid-argument', `L'orario di uscita non può essere uguale o precedente all'entrata.`);
          }
          
          const roundedClockOutTime = roundTimeWithCustomRulesServer(now, 'uscita');
          
          const clockOutLocation = (currentLat != null && currentLon != null) 
                                   ? new GeoPoint(currentLat, currentLon) 
                                   : null;
                                   
          await entryDoc.ref.update({
               clockOutTime: Timestamp.fromDate(roundedClockOutTime),
               clockOutLocation,
               status: 'clocked-out',
               lastModifiedBy: uid, 
               lastModifiedAt: FieldValue.serverTimestamp() 
          });
          return { success: true, message: "Timbratura di uscita registrata." };
     } catch (error) {
          if (error.code && error.code.startsWith('functions')) throw error;
          throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
     }
});