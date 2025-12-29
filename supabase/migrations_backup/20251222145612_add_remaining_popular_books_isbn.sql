/*
  # Ajout des ISBN manquants pour les livres populaires

  1. Modifications
    - Ajoute les ISBN pour les livres populaires restants
    - Met à jour les couvertures pour utiliser Open Library
  
  2. Livres mis à jour
    - Harry Potter à l'école des sorciers (J.K. Rowling): 9782070584628
    - Les Misérables (Victor Hugo): 9782253096337
    - Le Seigneur des Anneaux (J.R.R. Tolkien): 9782266154345
    - Orgueil et Préjugés (Jane Austen): 9782253085225
    - Ne tirez pas sur l'oiseau moqueur (Harper Lee): 9782253151647
*/

UPDATE books 
SET isbn = '9782070584628',
    cover_url = 'https://covers.openlibrary.org/b/isbn/9782070584628-L.jpg'
WHERE id = '565e4632-7e44-4c29-bf10-b110cc97f867' 
  AND title = 'Harry Potter à l''école des sorciers';

UPDATE books 
SET isbn = '9782253096337',
    cover_url = 'https://covers.openlibrary.org/b/isbn/9782253096337-L.jpg'
WHERE id = '8b335141-00a0-4ca1-95b0-871363607f53' 
  AND title = 'Les Misérables';

UPDATE books 
SET isbn = '9782266154345',
    cover_url = 'https://covers.openlibrary.org/b/isbn/9782266154345-L.jpg'
WHERE id = '809be858-84b9-433e-98bc-0bfd2a719e8d' 
  AND title = 'Le Seigneur des Anneaux';

UPDATE books 
SET isbn = '9782253085225',
    cover_url = 'https://covers.openlibrary.org/b/isbn/9782253085225-L.jpg'
WHERE id = 'db3535e7-a7e4-4f4b-a4a3-099899dabec2' 
  AND title = 'Orgueil et Préjugés';

UPDATE books 
SET isbn = '9782253151647',
    cover_url = 'https://covers.openlibrary.org/b/isbn/9782253151647-L.jpg'
WHERE id = '9d69da6a-9ff3-4998-b635-41ed1f7d729c' 
  AND title = 'Ne tirez pas sur l''oiseau moqueur';
