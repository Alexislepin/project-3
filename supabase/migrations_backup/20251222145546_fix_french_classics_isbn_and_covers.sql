/*
  # Correction des ISBN et couvertures pour les classiques français

  1. Modifications
    - Ajoute les ISBN manquants pour les classiques français
    - Met à jour les URLs de couverture pour utiliser Open Library comme fallback
  
  2. Livres mis à jour
    - Pensées pour moi-même (Marc Aurèle): ISBN 9782080712516
    - Le Rouge et le Noir (Stendhal): ISBN 9782253004462
    - Ainsi parlait Zarathoustra (Nietzsche): ISBN 9782253066651
*/

UPDATE books 
SET isbn = '9782253004462',
    cover_url = 'https://covers.openlibrary.org/b/isbn/9782253004462-L.jpg'
WHERE id = '73c312f7-eda3-49f8-8e0c-150c629fcdbf' 
  AND title = 'Le Rouge et le Noir';

UPDATE books 
SET isbn = '9782080712516',
    cover_url = 'https://covers.openlibrary.org/b/isbn/9782080712516-L.jpg'
WHERE id = '4760972b-11e8-4d8c-945b-06e7d6ad3686' 
  AND title = 'Pensées pour moi-même';

UPDATE books 
SET isbn = '9782253066651',
    cover_url = 'https://covers.openlibrary.org/b/isbn/9782253066651-L.jpg'
WHERE id = '068e69c0-c2f5-42d6-a026-04cdb882f935' 
  AND title = 'Ainsi parlait Zarathoustra';
