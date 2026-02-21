// Importa as funções do Firebase direto do Google
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// As suas chaves de acesso ao banco
const firebaseConfig = {
  apiKey: "AIzaSyAxU22mYf7ctyPviMKO8M3_-QfM2S-4-2k",
  authDomain: "orcamentointech-f69f9.firebaseapp.com",
  projectId: "orcamentointech-f69f9",
  storageBucket: "orcamentointech-f69f9.appspot.com",
  messagingSenderId: "508244564743",
  appId: "1:508244564743:web:1b315bc5e5299bcaad43a2"
};

// Inicializa a conexão
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);