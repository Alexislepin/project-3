/*
  # Mettre à jour les détails du livre de Marc-Aurèle

  1. Mise à jour
    - Ajoute la description, le nombre de pages, le genre, l'ISBN et l'éditeur pour "Pensées pour moi-même"
    - Utilise les informations complètes du livre

  2. Note
    - Cette mise à jour enrichit les données existantes sans supprimer le livre
*/

-- Mettre à jour le livre de Marc-Aurèle avec toutes les informations
UPDATE books
SET 
  description = 'Rédigées en grec entre 170 et 180 de notre ère, les Pensées de Marc Aurèle constituent un témoignage exceptionnel sur la philosophie stoïcienne. L''empereur philosophe y consigne ses réflexions personnelles sur la vertu, la sagesse, l''acceptation du destin et la maîtrise de soi. Ce texte intime, destiné à son propre usage, est devenu l''un des classiques de la philosophie antique.',
  total_pages = 256,
  genre = 'Philosophie',
  publisher = 'Flammarion',
  isbn = '9782080712516',
  edition = 'GF Flammarion'
WHERE title = 'Pensées pour moi-même. Suivies du Manuel d''Epictète'
  AND author = 'Marc-Aurèle (empereur romain)';
