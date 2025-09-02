import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD9bjpB9LxiixUJsJ_Wq4_dcbn3q9fj-7k",
  authDomain: "marcatempo-tcs.firebaseapp.com",
  projectId: "marcatempo-tcs",
  storageBucket: "marcatempo-tcs.appspot.com",
  messagingSenderId: "385748349249",
  appId: "1:385748349249:web:3e80c0dd1a8266f53f71c0",
  measurementId: "G-04EYMT11Q7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };