FICHIERS D'INTEGRATION E-MAIL STRIPE / GMAIL

Contenu :
- netlify/functions/create-checkout-session.js : fonction de paiement existante avec correctif du comptage de charms pour les produits catalogue.
- netlify/functions/stripe-webhook.js : vérifie la signature Stripe et envoie un e-mail Gmail SMTP après checkout.session.completed lorsque payment_status est paid.
- package.json : ajoute Nodemailer.

ETAPES DE CONFIGURATION
1. Remplacer les fichiers correspondants dans le dépôt GitHub.
2. Déployer sur Netlify.
3. Dans Stripe, créer un webhook vers https://VOTRE-DOMAINE/.netlify/functions/stripe-webhook
4. Sélectionner l'événement checkout.session.completed.
5. Copier le secret de signature (whsec_...) et le mettre dans Netlify comme variable STRIPE_WEBHOOK_SECRET.
6. Conserver GMAIL_USER, GMAIL_APP_PASSWORD et STRIPE_SECRET_KEY en variables d'environnement privées.
7. Redéployer après l'ajout de STRIPE_WEBHOOK_SECRET.

Ne partagez jamais les mots de passe ou secrets et ne les placez pas dans le code/GitHub.
Testez d'abord avec Stripe en mode test.

Note : Stripe peut réessayer un événement et un doublon d'e-mail reste possible si le premier envoi a réussi mais que la réponse webhook n'a pas été reçue. Une protection complète contre les doublons demande un stockage durable d'idempotence.
