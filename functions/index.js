const functions = require("firebase-functions");
const admin = require("firebase-admin");
// Import necessario per GeoPoint e Timestamp
const { Timestamp, GeoPoint, FieldValue } = require("firebase-admin/firestore"); 

admin.initializeApp();
const db = admin.firestore();

// ===============================================
// --- FUNZIONI DI GESTIONE UTENTI (Admin) ---
// ===============================================

/**
 * Crea un nuovo utente in Firebase Authentication, imposta il suo Custom Claim (ruolo),
 * e crea i documenti corrispondenti in Firestore ('users' e 'employees' se applicabile).
 * Richiede privilegi da admin.
 */
exports.createUser = functions.region('europe-west1').https.onCall(async (data, context) => {
    // 1. Controllo Autenticazione e Ruolo Admin
    if (context.auth?.token.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Solo un amministratore può creare nuovi utenti.');
    }

    // 2. Validazione Dati Ricevuti dal Client
    const { email, password, name, surname, role } = data; // Aggiunto 'phone' opzionale
    if (!email || !password || !name || !surname || !role) {
        throw new functions.https.HttpsError('invalid-argument', 'Email, password, nome, cognome e ruolo sono obbligatori.');
    }
    if (password.length < 6) {
        throw new functions.https.HttpsError('invalid-argument', 'La password deve essere di almeno 6 caratteri.');
    }
    // Verifica che il ruolo sia valido ('dipendente', 'preposto', 'admin')
    if (!['dipendente', 'preposto', 'admin'].includes(role)) {
         throw new functions.https.HttpsError('invalid-argument', `Ruolo "${role}" non valido.`);
    }

    // 3. Logica di Creazione Utente (dentro try/catch)
    try {
        // Crea l'utente in Firebase Authentication
        console.log(`Tentativo creazione utente: ${email}, Ruolo: ${role}`);
        const userRecord = await admin.auth().createUser({ 
            email, 
            password, 
            displayName: `${name} ${surname}` 
            // emailVerified: false // Opzionale: impostare a true se si vuole verificare l'email
        });
        console.log(`Utente Auth creato: ${userRecord.uid}`);

        // Imposta il Custom Claim per il ruolo (necessario per i controlli di sicurezza nelle functions)
        await admin.auth().setCustomUserClaims(userRecord.uid, { role });
        console.log(`Custom Claim '${role}' impostato per ${userRecord.uid}`);

        // Crea/Aggiorna il documento nella collezione 'users' (contiene info base e ruolo per l'app)
        const userDocRef = db.collection('users').doc(userRecord.uid);
        await userDocRef.set({ 
            name, 
            surname, 
            email, 
            role,
            phone: data.phone || null, // Salva telefono se fornito
            createdAt: FieldValue.serverTimestamp() // Data creazione
            // managedAreaIds: [] // Inizializza array vuoto per preposti/admin (se serve)
        });
        console.log(`Documento 'users/${userRecord.uid}' creato/aggiornato.`);

        // Se è un 'dipendente' o 'preposto', crea anche il documento nella collezione 'employees'
        // Questo documento contiene informazioni specifiche del lavoro (aree, device, ecc.)
        if (role === 'dipendente' || role === 'preposto') {
            const employeeData = { 
                userId: userRecord.uid, // Link all'utente Auth/users
                name, 
                surname, 
                email, 
                workAreaIds: [], // Inizia senza aree assegnate
                deviceIds: [],   // Inizia senza dispositivi associati
                createdAt: FieldValue.serverTimestamp()
            };
            // Usiamo l'UID come ID del documento anche in 'employees' per coerenza?
            // O un ID autogenerato? Usiamo autogenerato per ora.
            const employeeDocRef = await db.collection('employees').add(employeeData); 
            console.log(`Documento 'employees/${employeeDocRef.id}' creato per ${userRecord.uid}`);
        }

        // 4. Restituisce Successo
        return { success: true, message: `Utente ${email} (${role}) creato con successo con UID: ${userRecord.uid}` };

    } catch (error) {
        // 5. Gestione Errori
        console.error("Errore durante la creazione dell'utente:", error);
        // Se l'errore è 'email-already-exists', restituisci un messaggio chiaro
        if (error.code === 'auth/email-already-exists') {
             throw new functions.https.HttpsError('already-exists', 'Questa email è già registrata.');
        }
        // Altrimenti, restituisci un errore generico
        throw new functions.https.HttpsError('internal', `Errore del server durante la creazione utente: ${error.message}`);
    }
});


/**
 * Elimina un utente da Firebase Authentication e i suoi documenti correlati 
 * da Firestore ('users' e 'employees').
 * Richiede privilegi da admin.
 */
exports.deleteUserAndEmployee = functions.region('europe-west1').https.onCall(async (data, context) => {
    // 1. Controllo Autenticazione e Ruolo Admin
    if (context.auth?.token.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Solo un amministratore può eliminare utenti.');
    }

    // 2. Validazione Dati Ricevuti (UID dell'utente da eliminare)
    const { userId } = data;
    if (!userId) {
        throw new functions.https.HttpsError('invalid-argument', 'L\'UID dell\'utente da eliminare è obbligatorio.');
    }
    // Sicurezza aggiuntiva: impedire all'admin di auto-eliminarsi?
    if (userId === context.auth.uid) {
        // throw new functions.https.HttpsError('invalid-argument', 'Un amministratore non può auto-eliminarsi.');
        console.warn(`Admin ${context.auth.uid} ha tentato di auto-eliminarsi (userId: ${userId}). Operazione permessa per ora.`);
    }
    // Impedire l'eliminazione del Super Admin? (Opzionale)
    // const superAdminEmail = "domenico.leoncino@tcsitalia.com"; // Definisci la tua email super admin
    // const userToDelete = await admin.auth().getUser(userId);
    // if (userToDelete.email === superAdminEmail) {
    //    throw new functions.https.HttpsError('permission-denied', 'Impossibile eliminare l\'account Super Admin.');
    // }


    // 3. Logica di Eliminazione (dentro try/catch)
    try {
        console.log(`Tentativo eliminazione utente con UID: ${userId}`);
        
        // Elimina da Firebase Authentication
        await admin.auth().deleteUser(userId);
        console.log(`Utente Auth ${userId} eliminato.`);

        // Elimina il documento dalla collezione 'users'
        await db.collection('users').doc(userId).delete();
        console.log(`Documento 'users/${userId}' eliminato.`);

        // Trova ed elimina il documento corrispondente dalla collezione 'employees' (se esiste)
        // La query cerca il documento 'employees' che ha il campo 'userId' uguale all'UID eliminato
        const employeeQuery = await db.collection('employees').where('userId', '==', userId).limit(1).get();
        if (!employeeQuery.empty) {
            const employeeDocId = employeeQuery.docs[0].id;
            await employeeQuery.docs[0].ref.delete();
            console.log(`Documento 'employees/${employeeDocId}' eliminato.`);
        } else {
             console.log(`Nessun documento 'employees' trovato per l'utente ${userId}.`);
        }
        
        // TODO: Considerare cosa fare con le timbrature ('time_entries') dell'utente eliminato. 
        // Lasciarle (anonimizzate?) o eliminarle? Per ora le lasciamo.

        // 4. Restituisce Successo
        return { success: true, message: `Utente ${userId} e dati associati eliminati con successo.` };

    } catch (error) {
        // 5. Gestione Errori
        console.error(`Errore durante l'eliminazione dell'utente ${userId}:`, error);
        // Se l'utente non esiste già
        if (error.code === 'auth/user-not-found') {
             throw new functions.https.HttpsError('not-found', 'Utente non trovato in Authentication.');
        }
        // Altri errori
        throw new functions.https.HttpsError('internal', `Errore del server durante l'eliminazione: ${error.message}`);
    }
});

// ===============================================
// --- FUNZIONI AREA DI LAVORO (Admin) ---
// ===============================================

/**
 * Crea una nuova area di lavoro con dati geografici.
 * Richiede privilegi da admin.
 */
exports.createWorkArea = functions.region('europe-west1').https.onCall(async (data, context) => {
    // 1. Controllo Autenticazione e Ruolo Admin
    if (context.auth?.token.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Solo un amministratore può creare aree di lavoro.');
    }

    // 2. Validazione Dati Ricevuti
    const { name, latitude, longitude, radius, pauseDuration } = data;
    if (!name || latitude == null || longitude == null || radius == null) {
        throw new functions.https.HttpsError('invalid-argument', 'Nome, Latitudine, Longitudine e Raggio sono obbligatori per creare un\'area.');
    }
    const lat = Number(latitude);
    const lon = Number(longitude);
    const rad = Number(radius);
    const pause = Number(pauseDuration || 0); // Default a 0 se non fornito

    if (isNaN(lat) || isNaN(lon) || isNaN(rad) || rad <= 0 || isNaN(pause) || pause < 0) {
         throw new functions.https.HttpsError('invalid-argument', 'Latitudine/Longitudine devono essere numeri validi, Raggio > 0, Pausa >= 0.');
    }

    // 3. Logica di Creazione Area (dentro try/catch)
    try {
        console.log(`Tentativo creazione area: ${name}, Lat: ${lat}, Lon: ${lon}, R: ${rad}m, Pausa: ${pause}min`);
        
        // Crea l'oggetto GeoPoint per Firestore
        const location = new GeoPoint(lat, lon);

        // Aggiungi il nuovo documento alla collezione 'work_areas'
        const areaDocRef = await db.collection("work_areas").add({
            name: name,
            pauseDuration: pause,
            location: location, // Oggetto GeoPoint per query spaziali
            latitude: lat,       // Valore numerico per lettura facile dal client
            longitude: lon,      // Valore numerico
            radius: rad,         // Valore numerico (metri)
            createdAt: FieldValue.serverTimestamp() // Data creazione
        });
        console.log(`Area creata con successo: work_areas/${areaDocRef.id}`);

        // 4. Restituisce Successo
        return { success: true, message: `Area "${name}" creata con successo.`, areaId: areaDocRef.id };

    } catch (error) {
        // 5. Gestione Errori
        console.error("Errore durante la creazione dell'area:", error);
        throw new functions.https.HttpsError('internal', `Errore del server durante la creazione area: ${error.message}`);
    }
});

// Nota: Le funzioni per MODIFICARE ('updateWorkArea') e CANCELLARE ('deleteWorkArea') 
// un'area sono gestite direttamente dal client (AdminModal.js) tramite updateDoc/deleteDoc,
// poiché richiedono solo l'ID del documento e i controlli di sicurezza basati sul ruolo 
// sono sufficienti tramite le Regole di Sicurezza di Firestore.


// ===============================================
// --- FUNZIONI TIMBRATURA MANUALE (Admin/Preposto) ---
// ===============================================

/**
 * Registra una timbratura di ENTRATA manuale per un dipendente specificato.
 * Può essere chiamata da Admin o Preposto (con controlli aggiuntivi opzionali per preposto).
 */
exports.manualClockIn = functions.region('europe-west1').https.onCall(async (data, context) => {
    // 1. Controllo Autenticazione e Ruolo (Admin o Preposto)
    const callerUid = context.auth?.uid;
    const callerRole = context.auth?.token.role;
    if (!callerUid || (callerRole !== 'admin' && callerRole !== 'preposto')) {
        throw new functions.https.HttpsError('permission-denied', 'Azione consentita solo ad Amministratori e Preposti.');
    }

    // 2. Validazione Dati Ricevuti
    const { employeeId, workAreaId, timestamp, adminId } = data; // adminId è l'UID di chi fa la chiamata
    if (!employeeId || !workAreaId || !timestamp || !adminId || adminId !== callerUid) {
        throw new functions.https.HttpsError('invalid-argument', 'Dati mancanti o incoerenti per la timbratura manuale di entrata.');
    }
    const clockInTime = new Date(timestamp);
    if (isNaN(clockInTime.getTime())) {
         throw new functions.https.HttpsError('invalid-argument', 'Timestamp di entrata non valido.');
    }

    // 3. Logica di Timbratura (dentro try/catch)
    try {
         console.log(`Timbratura manuale ENTRATA: Admin/Preposto ${callerUid} per Dipendente ${employeeId} in Area ${workAreaId} alle ${clockInTime}`);
         
         // TODO Opzionale: Se il chiamante è 'preposto', verificare che 'employeeId' sia un dipendente
         // che il preposto può gestire (appartiene a una delle sue 'managedAreaIds').
         // Questo aggiunge un livello di sicurezza lato server.

         // Verifica se il dipendente ha già una timbratura attiva
         const activeEntryQuery = await db.collection('time_entries')
             .where('employeeId', '==', employeeId)
             .where('status', '==', 'clocked-in')
             .limit(1)
             .get();
         
         if (!activeEntryQuery.empty) {
             const activeEntry = activeEntryQuery.docs[0].data();
             const activeEntryTime = activeEntry.clockInTime.toDate().toLocaleString('it-IT');
             console.warn(`Dipendente ${employeeId} ha già una timbratura attiva iniziata il ${activeEntryTime}. Impossibile timbrare entrata.`);
             throw new functions.https.HttpsError('failed-precondition', `Il dipendente ha già una timbratura attiva iniziata il ${activeEntryTime}. Timbra prima l'uscita.`);
         }

         // Applica l'arrotondamento all'orario di entrata
         const roundedClockInTime = roundTimeWithCustomRulesServer(clockInTime, 'entrata');

         // Crea il nuovo documento di timbratura
         await db.collection('time_entries').add({
            employeeId: employeeId,       // ID del documento 'employees'
            workAreaId: workAreaId,       // ID del documento 'work_areas'
            clockInTime: Timestamp.fromDate(roundedClockInTime), // Orario di entrata (arrotondato)
            clockOutTime: null,          // Uscita non ancora registrata
            status: 'clocked-in',        // Stato attuale
            createdBy: callerUid,        // UID dell'Admin/Preposto che ha creato la timbratura
            pauses: [],                  // Array per le pause (inizia vuoto)
            isManual: true,              // Flag per indicare timbratura manuale
            createdAt: FieldValue.serverTimestamp() // Timestamp creazione documento
         });
         console.log(`Timbratura manuale ENTRATA registrata per ${employeeId}.`);

         // 4. Restituisce Successo
         return { success: true, message: "Timbratura di entrata manuale registrata con successo." };

    } catch (error) {
        // 5. Gestione Errori
        console.error(`Errore durante timbratura manuale IN per ${employeeId}:`, error);
        // Se è già un errore specifico, rimandalo
        if (error.code && error.message) { 
             throw error; 
        }
        // Altrimenti, errore generico
        throw new functions.https.HttpsError('internal', `Errore del server: ${error.message}`);
    }
});


/**
 * Registra una timbratura di USCITA manuale per un dipendente, chiudendo la sua timbratura attiva.
 * Può essere chiamata da Admin o Preposto.
 */
exports.manualClockOut = functions.region('europe-west1').https.onCall(async (data, context) => {
    // 1. Controllo Autenticazione e Ruolo (Admin o Preposto)
    const callerUid = context.auth?.uid;
    const callerRole = context.auth?.token.role;
    if (!callerUid || (callerRole !== 'admin' && callerRole !== 'preposto')) {
        throw new functions.https.HttpsError('permission-denied', 'Azione consentita solo ad Amministratori e Preposti.');
    }

    // 2. Validazione Dati Ricevuti
    const { employeeId, timestamp, adminId } = data; // adminId è l'UID di chi fa la chiamata
    if (!employeeId || !timestamp || !adminId || adminId !== callerUid) {
        throw new functions.https.HttpsError('invalid-argument', 'Dati mancanti o incoerenti per la timbratura manuale di uscita.');
    }
    const clockOutTime = new Date(timestamp);
    if (isNaN(clockOutTime.getTime())) {
         throw new functions.https.HttpsError('invalid-argument', 'Timestamp di uscita non valido.');
    }

    // 3. Logica di Timbratura (dentro try/catch)
    try {
        console.log(`Timbratura manuale USCITA: Admin/Preposto ${callerUid} per Dipendente ${employeeId} alle ${clockOutTime}`);

        // TODO Opzionale: Se il chiamante è 'preposto', verificare che 'employeeId' sia gestibile.

        // Trova l'UNICA timbratura attiva per questo dipendente
        const q = db.collection('time_entries')
                  .where('employeeId', '==', employeeId)
                  .where('status', '==', 'clocked-in')
                  .limit(1);
        const snapshot = await q.get();

        // Se non ci sono timbrature attive, restituisci errore
        if (snapshot.empty) {
            console.warn(`Nessuna timbratura attiva trovata per ${employeeId} per timbrare l'uscita.`);
            throw new functions.https.HttpsError('not-found', 'Nessuna timbratura di entrata attiva trovata per questo dipendente.');
        }
        const entryDoc = snapshot.docs[0];
        const entryData = entryDoc.data();

        // Verifica coerenza temporale (uscita deve essere dopo entrata)
        if (entryData.clockInTime.toDate() >= clockOutTime) {
             throw new functions.https.HttpsError('invalid-argument', `L'orario di uscita (${clockOutTime.toLocaleString('it-IT')}) deve essere successivo all'orario di entrata (${entryData.clockInTime.toDate().toLocaleString('it-IT')}).`);
        }
        // Verifica se c'è una pausa ancora attiva
        const activePause = (entryData.pauses || []).find(p => !p.end);
        if (activePause) {
             throw new functions.https.HttpsError('failed-precondition', 'Impossibile timbrare l\'uscita mentre il dipendente è in pausa. Terminare prima la pausa.');
        }

        // Applica l'arrotondamento all'orario di uscita
        const roundedClockOutTime = roundTimeWithCustomRulesServer(clockOutTime, 'uscita');

        // Aggiorna il documento della timbratura
        await entryDoc.ref.update({ 
            clockOutTime: Timestamp.fromDate(roundedClockOutTime), // Orario di uscita (arrotondato)
            status: 'clocked-out',       // Cambia stato
            lastModifiedBy: callerUid,   // Chi ha effettuato l'uscita manuale
            isManualExit: true           // Flag per uscita manuale (opzionale)
        });
        console.log(`Timbratura manuale USCITA registrata per ${employeeId} (doc: ${entryDoc.id}).`);

        // 4. Restituisce Successo
        return { success: true, message: "Timbratura di uscita manuale registrata con successo." };

    } catch (error) {
        // 5. Gestione Errori
        console.error(`Errore durante timbratura manuale OUT per ${employeeId}:`, error);
        if (error.code && error.message) { throw error; }
        throw new functions.https.HttpsError('internal', `Errore del server: ${error.message}`);
    }
});


// ===============================================
// --- FUNZIONI SPECIFICHE PREPOSTO ---
// ===============================================

/**
 * Permette a un preposto AUTENTICATO di timbrare la PROPRIA entrata.
 * Non richiede controllo GPS. Usa la funzione 'manualClockIn' per la logica effettiva.
 * OBSOLETA? - Il client ora chiama direttamente manualClockIn passando l'ID del preposto.
 * Mantenuta per retrocompatibilità o logica specifica futura.
 */
// exports.prepostoClockIn = functions.region('europe-west1').https.onCall(async (data, context) => {
//     const uid = context.auth?.uid;
//     const callerRole = context.auth?.token.role;
//     if (!uid || callerRole !== 'preposto') {
//         throw new functions.https.HttpsError('permission-denied', 'Funzione riservata ai preposti autenticati.');
//     }
    
//     const { workAreaId, timestamp } = data;
//     if (!workAreaId || !timestamp) {
//         throw new functions.https.HttpsError('invalid-argument', 'ID Area e orario sono obbligatori.');
//     }

//     try {
//         // Trova l'ID del documento 'employees' corrispondente all'UID del preposto
//         const employeeQuery = await db.collection('employees').where('userId', '==', uid).limit(1).get();
//         if (employeeQuery.empty) {
//             throw new functions.https.HttpsError('not-found', 'Profilo dipendente del preposto non trovato. Impossibile timbrare.');
//         }
//         const employeeId = employeeQuery.docs[0].id;

//         console.log(`Preposto ${uid} (Employee ${employeeId}) timbra ENTRATA in Area ${workAreaId} alle ${timestamp}`);
        
//         // Riusa la logica di manualClockIn
//         return manualClockIn({ // Chiama la funzione JS, non via HTTP
//            employeeId: employeeId, 
//            workAreaId: workAreaId, 
//            timestamp: timestamp, 
//            adminId: uid // Il preposto stesso crea la timbratura
//         }, context); // Passa il contesto per eventuali controlli futuri

//     } catch (error) {
//         console.error("Errore durante prepostoClockIn:", error);
//         if (error.code && error.message) { throw error; }
//         throw new functions.https.HttpsError('internal', error.message);
//     }
// });


/**
 * Gestisce l'inizio o la fine della pausa per il preposto AUTENTICATO sulla sua timbratura attiva.
 * Non richiede controllo GPS.
 * OBSOLETA? - Il client gestisce la pausa tramite updateDoc diretto? No, meglio funzione per logica server-side.
 */
exports.prepostoTogglePause = functions.region('europe-west1').https.onCall(async (data, context) => {
    // 1. Controllo Autenticazione e Ruolo Preposto
    const uid = context.auth?.uid;
    const callerRole = context.auth?.token.role;
    if (!uid || callerRole !== 'preposto') {
        throw new functions.https.HttpsError('permission-denied', 'Funzione riservata ai preposti autenticati.');
    }

    // 2. Logica Pausa (dentro try/catch)
    try {
        console.log(`Preposto ${uid} tenta di iniziare/terminare la pausa.`);
        
        // Trova l'ID dipendente del preposto
        const employeeQuery = await db.collection('employees').where('userId', '==', uid).limit(1).get();
        if (employeeQuery.empty) {
            throw new functions.https.HttpsError('not-found', 'Profilo dipendente del preposto non trovato.');
        }
        const employeeId = employeeQuery.docs[0].id;
        
        // Trova la timbratura ATTIVA del preposto
        const q = db.collection('time_entries')
                  .where('employeeId', '==', employeeId)
                  .where('status', '==', 'clocked-in')
                  .limit(1);
        const snapshot = await q.get();
        if (snapshot.empty) {
            throw new functions.https.HttpsError('not-found', 'Nessuna timbratura attiva trovata per iniziare/terminare la pausa.');
        }

        const entryRef = snapshot.docs[0].ref;
        const entryData = snapshot.docs[0].data();
        const currentPauses = entryData.pauses || [];
        const now = Timestamp.now(); // Ora corrente

        // Cerca una pausa attiva (senza 'end')
        const activePauseIndex = currentPauses.findIndex(p => p.start && !p.end);

        if (activePauseIndex !== -1) { // Se c'è una pausa attiva, la termino
            currentPauses[activePauseIndex].end = now;
            console.log(`Preposto ${uid} termina la pausa sulla timbratura ${entryRef.id}`);
            await entryRef.update({ pauses: currentPauses });
            return { success: true, message: `Pausa terminata.` };
        } else { // Altrimenti, ne inizio una nuova
            currentPauses.push({ start: now, end: null });
            console.log(`Preposto ${uid} inizia la pausa sulla timbratura ${entryRef.id}`);
            await entryRef.update({ pauses: currentPauses });
            return { success: true, message: `Pausa iniziata.` };
        }

    } catch (error) {
        // 3. Gestione Errori
        console.error(`Errore durante gestione pausa per preposto ${uid}:`, error);
        if (error.code && error.message) { throw error; }
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Permette a un preposto di assegnare/rimuovere un dipendente
 * SOLO alle/dalle aree di lavoro che GESTISCE.
 */
exports.prepostoAssignEmployeeToArea = functions.region('europe-west1').https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    const callerRole = context.auth?.token.role;

    // 1. Sicurezza: Controllo ruolo Preposto
    if (!uid || callerRole !== 'preposto') {
        throw new functions.https.HttpsError('permission-denied', 'Solo un preposto può eseguire questa azione.');
    }

    const { employeeId, areaIds } = data; // areaIds è l'array di ID area selezionati dal preposto

    // 2. Validazione Input
    if (!employeeId || !Array.isArray(areaIds)) {
        // Permettiamo un array vuoto per rimuovere tutte le aree gestite
        throw new functions.https.HttpsError('invalid-argument', 'ID dipendente e lista aree (anche vuota) sono obbligatori.');
    }

    try {
        console.log(`Preposto ${uid} tenta di assegnare Dipendente ${employeeId} alle aree gestite: [${areaIds.join(', ')}]`);
        
        // 3. Recupera le aree GESTITE dal preposto loggato (dal documento 'users')
        const prepostoUserDoc = await db.collection('users').doc(uid).get();
        if (!prepostoUserDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Profilo utente del preposto non trovato.');
        }
        const managedAreaIds = prepostoUserDoc.data().managedAreaIds || [];
        console.log(`Aree gestite dal preposto ${uid}: [${managedAreaIds.join(', ')}]`);

        // Se il preposto non gestisce aree, non può assegnare nulla
        if (managedAreaIds.length === 0) {
             throw new functions.https.HttpsError('permission-denied', 'Non gestisci nessuna area specifica. Impossibile assegnare dipendenti.');
        }

        // 4. Sicurezza: Verifica che TUTTE le 'areaIds' richieste siano tra quelle GESTITE
        const isAllowed = areaIds.every(id => managedAreaIds.includes(id));
        if (!isAllowed) {
            const forbiddenAreas = areaIds.filter(id => !managedAreaIds.includes(id));
            console.warn(`Tentativo non autorizzato da ${uid} di assegnare aree non gestite: [${forbiddenAreas.join(', ')}]`);
            throw new functions.https.HttpsError('permission-denied', 'Puoi assegnare dipendenti solo alle aree di lavoro che gestisci.');
        }

        // 5. Recupera le aree ATTUALMENTE assegnate al dipendente (dal documento 'employees')
        const employeeRef = db.collection('employees').doc(employeeId);
        const employeeDoc = await employeeRef.get();
        if (!employeeDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Dipendente specificato non trovato.');
        }
        const currentWorkAreaIds = employeeDoc.data().workAreaIds || [];
        console.log(`Aree attuali del dipendente ${employeeId}: [${currentWorkAreaIds.join(', ')}]`);

        // 6. Calcola il NUOVO set di aree per il dipendente:
        //    Mantiene le aree assegnate in precedenza CHE NON SONO GESTITE da questo preposto
        //    + aggiunge (o sostituisce) quelle NUOVE selezionate dal preposto (che sono sicuramente tra quelle gestite).
        const otherAreaIds = currentWorkAreaIds.filter(id => !managedAreaIds.includes(id));
        // Il nuovo array finale contiene le aree non toccate + quelle selezionate ora dal preposto
        const finalAreaIds = [...new Set([...otherAreaIds, ...areaIds])]; // Usa Set per rimuovere eventuali duplicati
        console.log(`Nuove aree calcolate per ${employeeId}: [${finalAreaIds.join(', ')}]`);

        // 7. Aggiorna il documento del dipendente in Firestore
        await employeeRef.update({ 
            workAreaIds: finalAreaIds,
            lastModifiedBy: uid, // Traccia chi ha fatto l'ultima modifica (opzionale)
            lastModifiedAt: FieldValue.serverTimestamp() // Timestamp modifica (opzionale)
        });
        console.log(`Documento employees/${employeeId} aggiornato con le nuove aree.`);

        // 8. Restituisce Successo
        return { success: true, message: `Aree di competenza aggiornate per il dipendente.` };

    } catch (error) {
        // 9. Gestione Errori
        console.error(`Errore in prepostoAssignEmployeeToArea (Caller: ${uid}, Target: ${employeeId}):`, error);
        if (error.code && error.message) { // Se è già un HttpsError, rimandalo
            throw error;
        }
        // Altrimenti errore generico
        throw new functions.https.HttpsError('internal', `Errore del server durante l'assegnazione aree: ${error.message}`);
    }
});


// ===============================================
// --- FUNZIONE PATCH PER ADMIN CLAIM (Temporanea) ---
// ===============================================

/**
 * Funzione TEMPORANEA da chiamare UNA SOLA VOLTA per impostare il Custom Claim 'admin'
 * sull'account del Super Amministratore specificato.
 * Può essere chiamata SOLO dall'email specifica del super admin loggato.
 */
exports.TEMP_fixMyClaim = functions.region('europe-west1').https.onCall(async (data, context) => {
    // 1. Controllo Autenticazione
    const uid = context.auth?.uid;
    if (!uid) {
        throw new functions.https.HttpsError('unauthenticated', 'Devi essere autenticato per eseguire questa operazione.');
    }

    // 2. Sicurezza RIGIDA: Solo l'email specifica può eseguirla
    const email = context.auth.token.email;
    const superAdminEmail = "domenico.leoncino@tcsitalia.com"; // Assicurati sia corretta
    
    if (email !== superAdminEmail) {
         console.warn(`Tentativo non autorizzato di eseguire TEMP_fixMyClaim da ${email} (UID: ${uid})`);
         throw new functions.https.HttpsError('permission-denied', `Azione permessa solo all'utente ${superAdminEmail}.`);
    }

    // 3. Logica Patch (dentro try/catch)
    try {
        console.log(`Esecuzione TEMP_fixMyClaim richiesta da ${email} (UID: ${uid})`);
        
        // Imposta il Custom Claim 'admin' sull'utente autenticato
        await admin.auth().setCustomUserClaims(uid, { role: 'admin' });
        console.log(`Custom Claim 'admin' impostato con successo per ${uid}`);
        
        // Sicurezza aggiuntiva: Assicura che anche il documento 'users' in Firestore sia allineato
        const userDocRef = db.collection('users').doc(uid);
        await userDocRef.update({ role: 'admin' }); // Usa update per non sovrascrivere altri campi
        console.log(`Documento 'users/${uid}' aggiornato con role: 'admin'.`);
        
        // 4. Restituisce Successo
        return { success: true, message: `Ruolo 'admin' impostato con successo per ${email}. Effettua Logout e Login per applicare.` };
    
    } catch (error) {
        // 5. Gestione Errori
         console.error(`Errore durante l'esecuzione di TEMP_fixMyClaim per ${uid}:`, error);
         throw new functions.https.HttpsError('internal', `Errore del server durante l'impostazione del ruolo: ${error.message}`);
    }
});


// ===============================================
// --- FUNZIONI AUSILIARIE (Interne al Server) ---
// ===============================================

/**
 * Funzione di arrotondamento orario (versione server-side).
 * @param {Date} date Oggetto Date da arrotondare.
 * @param {'entrata'|'uscita'} type Tipo di arrotondamento.
 * @returns {Date} Oggetto Date arrotondato.
 */
function roundTimeWithCustomRulesServer(date, type) {
    const newDate = new Date(date.getTime());
    const minutes = newDate.getMinutes();
    
    if (type === 'entrata') {
        if (minutes >= 46) { // Da xx:46 a xx:59 -> Ora successiva :00
            newDate.setHours(newDate.getHours() + 1);
            newDate.setMinutes(0);
        } else if (minutes >= 16) { // Da xx:16 a xx:45 -> Stessa ora :30
            newDate.setMinutes(30);
        } else { // Da xx:00 a xx:15 -> Stessa ora :00
            newDate.setMinutes(0);
        }
    } else if (type === 'uscita') {
        if (minutes >= 30) { // Da xx:30 a xx:59 -> Stessa ora :30
            newDate.setMinutes(30);
        } else { // Da xx:00 a xx:29 -> Stessa ora :00
            newDate.setMinutes(0);
        }
    }
    // Azzera secondi e millisecondi
    newDate.setSeconds(0);
    newDate.setMilliseconds(0);
    return newDate;
};