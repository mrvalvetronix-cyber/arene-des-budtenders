/* Données partagées entre le serveur (Node) et le client (navigateur).
   Extraites de « La quête du budtender » — quart d'initiation. */
(function (root) {
  'use strict';

  var QUESTS = [
    {
      title: 'La demande terre-à-terre', reward: 25, style: 2,
      speech: '<b>Cliente :</b> « Je cherche un profil aromatique terreux et musqué. Rien de compliqué. »',
      prompt: 'Quel terpène correspond le mieux à la description?',
      options: ['Myrcène', 'Limonène', 'Pinène'], answer: 0,
      success: 'Bon nez! Le myrcène est souvent associé aux notes terreuses et musquées.',
      fail: 'Le myrcène était le meilleur indice ici : terreux et musqué.',
      hint: 'Pense aux arômes de sous-bois et de terre humide.'
    },
    {
      title: 'La réserve fait des maths', reward: 30, style: 3,
      speech: '<b>Justin :</b> « Trois boîtes de 6 préroulés et 4 unités au présentoir. Combien au total? »',
      prompt: 'Le client attend. Fais l’inventaire sans sortir la calculatrice.',
      options: ['18 unités', '22 unités', '28 unités'], answer: 1,
      success: '22 pile. Et Justin rappelle : en public, la limite légale est 30 g de cannabis séché ou l’équivalent.',
      fail: 'Trois fois six, plus quatre : 22 unités. Repère légal : maximum 30 g en public.',
      hint: 'Multiplie d’abord 3 × 6, puis ajoute le présentoir.'
    },
    {
      title: 'L’introuvable parfum', reward: 35, style: 3,
      speech: '<b>Client :</b> « Quelque chose aux notes douces, florales et parfois herbacées? »',
      prompt: 'Quel profil aromatique lui présentes-tu?',
      options: ['Ocimène', 'Caryophyllène', 'Pinène'], answer: 0,
      success: 'Excellent flair. L’ocimène peut évoquer le doux, le floral et l’herbacé.',
      fail: 'L’ocimène collait le mieux au trio doux, floral et herbacé.',
      hint: 'Son nom commence par O et son profil peut être floral.'
    },
    {
      title: 'Le dossier Bubba Kush', reward: 65, style: 4,
      speech: '<b>Cliente :</b> « Bubba Kush, c’est indica : son effet est donc garanti, non? »',
      prompt: 'Quelle réponse est la plus juste pour comparer des variétés?',
      options: ['Oui, le nom suffit', 'Non : vérifier THC, CBD, terpènes et lot', 'Seulement la couleur compte'], answer: 1,
      success: 'Bien vu. Les mentions indica, sativa ou hybride donnent un repère général, pas une promesse d’effet.',
      fail: 'Le nom de variété ne suffit pas : la teneur en THC et CBD, les terpènes, le lot et la personne comptent aussi.',
      hint: 'Une variété peut changer d’un lot à l’autre : lis les données mesurées.',
      consultation: {
        intro: 'Pose trois questions avant de recommander quoi que ce soit.',
        questions: [
          { label: 'Quel effet recherches-tu?', reply: '« Je veux relaxer sans être complètement assommée. »' },
          { label: 'À quel moment?', reply: '« En fin de soirée, après le travail. »' },
          { label: 'Quelle est ton expérience?', reply: '« Occasionnelle — je préfère commencer doucement. »' }
        ],
        options: ['Un produit équilibré THC/CBD, dose modérée', 'Le produit au THC le plus élevé', 'Choisir uniquement parce que c’est “indica”'], answer: 0,
        success: 'Consultation exemplaire! Tu adaptes puissance, format et profil à son expérience.',
        fail: 'La cliente repart surtout avec une histoire sur la fois où Justin a choisi un produit à cause de la couleur du pot.'
      }
    },
    {
      title: 'Le client indécis', reward: 60, style: 4,
      speech: '<b>Client :</b> « Fleurs ou préroulé? Je ne sais même pas par où commencer. »',
      prompt: 'Quelle est ta meilleure première réponse?',
      options: ['Prendre le plus cher', 'Demander ses préférences et son format', 'Choisir au hasard'], answer: 1,
      success: 'Service impeccable : on clarifie le besoin avant de proposer.',
      fail: 'Le bon réflexe était de poser une question sur ses préférences et son format.',
      hint: 'Un bon conseil commence par une question, pas par un prix.',
      consultation: {
        intro: 'Découvre ses besoins avant de lui proposer un format.',
        questions: [
          { label: 'Quel moment de la journée?', reply: '« Le jour, quand je retrouve des amis. »' },
          { label: 'Quel format préfères-tu?', reply: '« Sans combustion, et facile à doser. »' },
          { label: 'Indica, sativa ou hybride?', reply: '« Hybride, mais je veux surtout lire le THC, le CBD et les terpènes. »' }
        ],
        options: ['Une huile équilibrée avec dosage clair', 'Des fleurs choisies au hasard', 'Le produit le plus cher de la section'], answer: 0,
        success: 'Besoins ciblés, format respecté, étiquette vérifiée : Justin inscrit un double soleil à ton dossier.',
        fail: 'Justin fait sonner sa petite cloche “conseil au hasard” et le ficus du comptoir semble te juger.'
      }
    },
    {
      title: 'Le format sans fumée', reward: 40, style: 2,
      speech: '<b>Cliente :</b> « Je ne veux ni fumer ni vapoter. Quelle section du magasin dois-je regarder? »',
      prompt: 'Quel duo correspond à des formats oraux sans combustion?',
      options: ['Huiles et capsules', 'Fleurs et préroulés', 'Kief et haschich'], answer: 0,
      success: 'Exact. Huiles, capsules, boissons et certains comestibles offrent des formats sans inhalation.',
      fail: 'Les huiles et capsules sont des formats oraux sans combustion; fleurs et préroulés sont inhalés.',
      hint: 'Cherche deux formats qui se consomment par la bouche.'
    },
    {
      title: 'Le retour à la maison', reward: 40, style: 2,
      speech: '<b>Cliente :</b> « J’ai déjà 140 g à la maison. Puis-je en rapporter 20 g de plus? »',
      prompt: 'Quelle réponse respecte la limite québécoise à domicile?',
      options: ['Oui, sans limite', 'Non : maximum total de 150 g', 'Oui, si deux adultes y vivent'], answer: 1,
      success: 'Exact : 150 g maximum à domicile, peu importe le nombre d’adultes qui y habitent.',
      fail: 'La limite est de 150 g par domicile, peu importe le nombre d’adultes qui y habitent.',
      hint: 'Additionne la quantité déjà à la maison et celle rapportée.'
    },
    {
      title: 'La carte oubliée', reward: 45, style: 4,
      speech: '<b>Jeune client :</b> « J’ai 20 ans, mais je connais le cousin du voisin du patron. »',
      prompt: 'Au Québec, quelle réponse garde le comptoir dans les règles?',
      options: ['Vendre discrètement', 'Refuser la vente', 'Donner un rabais'], answer: 1,
      success: 'Exact. L’âge légal d’achat au Québec est 21 ans.',
      fail: 'Il fallait refuser la vente : l’âge légal d’achat est 21 ans au Québec.',
      hint: 'Le Québec fixe un âge supérieur à 18 ans pour le cannabis.'
    },
    {
      title: 'Le jardin interdit', reward: 50, style: 2,
      speech: '<b>Cliente :</b> « Je peux faire pousser quelques plants chez moi, non? »',
      prompt: 'Quelle règle s’applique à la culture personnelle au Québec?',
      options: ['Quatre plants permis', 'Interdite, même pour un plant', 'Permise seulement l’été'], answer: 1,
      success: 'Exact : la culture personnelle et même la possession d’un plant sont interdites au Québec.',
      fail: 'Au Québec, la culture personnelle et la possession d’un plant sont interdites.',
      hint: 'La règle québécoise ne permet aucun plant à domicile.'
    },
    {
      title: 'Le retour responsable', reward: 70, style: 3,
      speech: '<b>Client :</b> « Je repars en voiture. Je consommerai juste avant, ça va? »',
      prompt: 'Quelle réponse clôt le quart en sécurité?',
      options: ['Oui, doucement', 'Non : jamais conduire avec les facultés affaiblies', 'Seulement avec les fenêtres ouvertes'], answer: 1,
      success: 'Exact. Facultés affaiblies et volant ne vont jamais ensemble.',
      fail: 'La conduite avec les facultés affaiblies est interdite. Il faut prévoir un retour sobre.',
      hint: 'Aucune astuce ne rend la conduite avec facultés affaiblies sécuritaire.'
    }
  ];

  var QUIZ = [
    { source: 'Justin demande :', q: 'Quelle planète est surnommée la planète rouge?', a: ['Vénus', 'Mars', 'Jupiter'], ok: 1, fact: 'Mars, évidemment. Bonus empoché!' },
    { source: 'Une cliente lance :', q: 'Plus je sèche, plus je deviens mouillée. Qui suis-je?', a: ['Une serviette', 'Une bougie', 'Une botte'], ok: 0, fact: 'Une serviette! Devinette essorée, bonus empoché.' },
    { source: 'Justin pointe l’étiquette :', q: 'Au Québec, quel âge faut-il avoir pour acheter du cannabis?', a: ['18 ans', '19 ans', '21 ans'], ok: 2, fact: '21 ans. La règle ne prend pas de pause.' },
    { source: 'Un habitué demande :', q: 'Quel terpène rappelle souvent l’agrume?', a: ['Limonène', 'Myrcène', 'Pinène'], ok: 0, fact: 'Limonène : le nom donnait presque la réponse.' },
    { source: 'Justin teste la loi :', q: 'Qui peut vendre du cannabis au détail au Québec?', a: ['Toute pharmacie', 'La SQDC seulement', 'Tout dépanneur'], ok: 1, fact: 'La SQDC seulement. Point réglementaire réussi.' },
    { source: 'Une touriste demande :', q: 'Peut-on fumer dans les lieux qui accueillent le public au Québec?', a: ['Oui partout', 'Non, intérieurs et extérieurs', 'Seulement le dimanche'], ok: 1, fact: 'Non : l’interdiction vise les lieux accueillant le public, même extérieurs, incluant la voie publique.' },
    { source: 'Quiz de rangement :', q: 'Quelle est la limite totale de cannabis séché à domicile?', a: ['30 g', '150 g', '500 g'], ok: 1, fact: '150 g au total, peu importe le nombre d’adultes dans la résidence.' },
    { source: 'Quiz de file d’attente :', q: 'Quel nombre vient ensuite : 2, 4, 8, 16…?', a: ['18', '24', '32'], ok: 2, fact: '32. On doublait à chaque étape.' },
    { source: 'Justin murmure :', q: 'Je peux remplir une pièce sans prendre de place. Qui suis-je?', a: ['La lumière', 'Une armoire', 'Un sac'], ok: 0, fact: 'La lumière! Justin approuve en silence.' },
    { source: 'Justin sort trois fiches :', q: 'Les mentions indica, sativa et hybride servent surtout à quoi?', a: ['Donner un repère général', 'Garantir un effet précis', 'Mesurer le THC'], ok: 0, fact: 'Un repère général seulement : l’étiquette complète et la réaction individuelle restent essentielles.' },
    { source: 'Dossier Bubba Kush :', q: 'Deux lots portant le nom Bubba Kush ont-ils forcément la même teneur?', a: ['Oui, toujours', 'Non, il faut vérifier l’étiquette', 'Seulement en format 3,5 g'], ok: 1, fact: 'Exact : le nom de variété ne remplace jamais les valeurs THC/CBD du lot.' },
    { source: 'Quiz des croisements :', q: 'Que signifie généralement « hybride »?', a: ['Un croisement de lignées', 'Un produit sans cannabinoïdes', 'Un arôme artificiel'], ok: 0, fact: 'Hybride désigne généralement un croisement de lignées; ce n’est pas une garantie d’effet.' },
    { source: 'Tri de la réserve :', q: 'Quel trio correspond à des catégories offertes par la SQDC?', a: ['Fleurs, huiles, boissons', 'Parfums, sodas, vitamines', 'Tabac, alcool, café'], ok: 0, fact: 'Fleurs, huiles et boissons font partie des formats de cannabis offerts.' },
    { source: 'Justin pointe la section des produits oraux :', q: 'Quel format se consomme sans combustion ni vapotage?', a: ['Capsules', 'Préroulés', 'Fleurs séchées'], ok: 0, fact: 'Les capsules sont un format oral; les préroulés et fleurs sont destinés à l’inhalation.' },
    { source: 'Quiz du vaporisateur :', q: 'Une huile orale et une cartouche de vapotage sont-elles interchangeables?', a: ['Oui, toujours', 'Non, chaque format a son usage prévu', 'Seulement si elles ont le même goût'], ok: 1, fact: 'Non. Il faut respecter l’usage indiqué sur l’emballage de chaque produit.' },
    { source: 'Quiz comestible :', q: 'Par rapport à l’inhalation, l’effet d’un produit comestible apparaît généralement…', a: ['Plus lentement', 'Instantanément', 'Jamais'], ok: 0, fact: 'Plus lentement; attendre avant d’en reprendre aide à éviter d’en consommer trop.' },
    { source: 'Tony ouvre le carnet des terpènes :', q: 'Quel terpène est le plus directement associé à une odeur de pin frais?', a: ['α-pinène', 'Linalol', 'β-caryophyllène'], ok: 0, fact: 'L’α-pinène porte bien son nom : son profil rappelle le pin et les conifères.' },
    { source: 'Justin présente trois fioles :', q: 'Quel terpène évoque surtout le poivre noir et les épices?', a: ['β-caryophyllène', 'Limonène', 'Ocimène'], ok: 0, fact: 'Le β-caryophyllène est reconnu pour son profil poivré et épicé.' },
    { source: 'Véro demande une lecture sensorielle :', q: 'Quel terpène est couramment décrit comme floral et proche de la lavande?', a: ['Linalol', 'Myrcène', 'Humulène'], ok: 0, fact: 'Le linalol possède un parfum floral souvent rapproché de la lavande.' },
    { source: 'Tony pousse la précision chimique :', q: 'Lequel de ces terpènes est un sesquiterpène plutôt qu’un monoterpène?', a: ['β-caryophyllène', 'Limonène', 'α-pinène'], ok: 0, fact: 'Le β-caryophyllène est un sesquiterpène; le limonène et l’α-pinène sont des monoterpènes.' }
  ];

  /* Ordre d'une manche : 10 quêtes + 4 quiz éclair intercalés (comme le jeu solo). */
  var DECK_ORDER = [
    { kind: 'quest', id: 0 }, { kind: 'quest', id: 1 }, { kind: 'quest', id: 2 },
    { kind: 'quiz', id: 16 },
    { kind: 'quest', id: 3 }, { kind: 'quest', id: 4 },
    { kind: 'quiz', id: 17 },
    { kind: 'quest', id: 5 }, { kind: 'quest', id: 6 },
    { kind: 'quiz', id: 18 },
    { kind: 'quest', id: 7 }, { kind: 'quest', id: 8 },
    { kind: 'quiz', id: 19 },
    { kind: 'quest', id: 9 }
  ];

  var DUEL_QUESTIONS = [
    { q: "Quel est le principal composé psychoactif du cannabis?", options: ["Le THC (tétrahydrocannabinol)", "Le CBD (cannabidiol)", "Le CBG (cannabigérol)", "Le CBN (cannabinol)"], answer: 0, difficulty: 1, cat: "science" },
    { q: "Le CBD provoque-t-il un « high » comme le THC?", options: ["Oui, exactement pareil", "Non, il n'est pas intoxicant comme le THC", "Oui, mais seulement à forte dose", "Seulement s'il est fumé"], answer: 1, difficulty: 1, cat: "science" },
    { q: "Où sont produits les cannabinoïdes et les terpènes de la plante?", options: ["Dans les racines", "Dans les trichomes, ces glandes résineuses", "Dans les graines", "Dans la tige principale"], answer: 1, difficulty: 1, cat: "science" },
    { q: "Quelle partie de la plante contient le plus de THC?", options: ["Les racines", "Les tiges", "Les fleurs", "Les graines"], answer: 2, difficulty: 1, cat: "science" },
    { q: "Que fait la décarboxylation?", options: ["Elle extrait les terpènes à froid", "Elle transforme le THCA en THC grâce à la chaleur", "Elle sépare les graines des fleurs", "Elle mesure le taux d'humidité"], answer: 1, difficulty: 1, cat: "science" },
    { q: "Le cannabis appartient à la même famille que quelle plante?", options: ["La tomate", "Le houblon", "Le tabac", "Le café"], answer: 1, difficulty: 1, cat: "science" },
    { q: "La graine de chanvre est appréciée parce qu'elle est…", options: ["Riche en THC", "Nutritive : protéines complètes et oméga-3/6", "Toxique crue", "Interdite à la vente"], answer: 1, difficulty: 1, cat: "science" },
    { q: "Qui a élucidé la structure du THC en 1964?", options: ["Louis Pasteur", "Raphael Mechoulam", "Alexander Fleming", "Marie Curie"], answer: 1, difficulty: 2, cat: "science" },
    { q: "Où se trouvent principalement les récepteurs CB1?", options: ["Dans le système immunitaire", "Dans le cerveau et le système nerveux central", "Dans la peau", "Dans les muscles"], answer: 1, difficulty: 2, cat: "science" },
    { q: "Et les récepteurs CB2, on les trouve surtout…", options: ["Dans le cerveau", "Dans le système immunitaire", "Dans les os", "Dans les yeux"], answer: 1, difficulty: 2, cat: "science" },
    { q: "Quel terpène, souvent dominant, évoque la terre et le musc?", options: ["Le limonène", "Le myrcène", "Le pinène", "Le linalol"], answer: 1, difficulty: 2, cat: "science" },
    { q: "Le limonène évoque quel parfum?", options: ["Le pin", "Les agrumes", "Le poivre", "La lavande"], answer: 1, difficulty: 2, cat: "science" },
    { q: "Le pinène évoque…", options: ["Les agrumes", "La lavande", "Le pin et le sapin", "Le poivre noir"], answer: 2, difficulty: 2, cat: "science" },
    { q: "Quel est le seul terpène connu pour se lier directement aux récepteurs CB2?", options: ["Le myrcène", "Le limonène", "Le caryophyllène", "L'ocimène"], answer: 2, difficulty: 2, cat: "science" },
    { q: "L'effet d'entourage, c'est…", options: ["La synergie entre cannabinoïdes, terpènes et autres composés", "L'effet de la foule dans un salon de consommation", "Une technique de taille", "Un type de séchage"], answer: 0, difficulty: 2, cat: "science" },
    { q: "Le cannabis non chauffé contient surtout…", options: ["Du THC actif", "Du THCA, non psychoactif avant chauffage", "Du CBN", "Du CBD pur"], answer: 1, difficulty: 2, cat: "science" },
    { q: "Environ combien de cannabinoïdes ont été identifiés dans le cannabis?", options: ["Une dizaine", "Une vingtaine", "Plus d'une centaine", "Plus d'un millier"], answer: 2, difficulty: 2, cat: "science" },
    { q: "Quel terpène, aussi présent dans la lavande, évoque le floral?", options: ["Le linalol", "Le myrcène", "Le pinène", "Le caryophyllène"], answer: 0, difficulty: 2, cat: "science" },
    { q: "L'ocimène évoque quelles notes?", options: ["Poivrées et épicées", "Douces, florales et herbacées", "Agrumes et citron", "Pin et résine"], answer: 1, difficulty: 2, cat: "science" },
    { q: "Après un comestible, le foie transforme le THC en…", options: ["CBD", "11-hydroxy-THC, plus puissant et durable", "CBN", "THCA"], answer: 1, difficulty: 2, cat: "science" },
    { q: "Un comestible, comparé à l'inhalation…", options: ["Agit plus vite et moins longtemps", "Agit plus lentement mais dure plus longtemps", "N'a aucun effet", "Agit uniquement sur la digestion"], answer: 1, difficulty: 2, cat: "science" },
    { q: "Au Canada, le chanvre industriel se définit par…", options: ["Sa hauteur", "Un taux de THC d'au plus 0,3 %", "Sa couleur", "Son odeur"], answer: 1, difficulty: 2, cat: "science" },
    { q: "L'huile de graines de chanvre…", options: ["Contient autant de CBD que l'huile de CBD", "Ne contient pas de CBD comme l'huile de CBD", "Est illégale", "Se fume"], answer: 1, difficulty: 2, cat: "science" },
    { q: "Quel effet cognitif à court terme du THC est bien documenté?", options: ["Une mémoire photographique", "Une altération de la mémoire à court terme", "Une vision nocturne", "Une ouïe surdéveloppée"], answer: 1, difficulty: 2, cat: "science" },
    { q: "Le dronabinol (Marinol), du THC synthétique, a été approuvé dans les années…", options: ["1960", "1980", "2000", "2020"], answer: 1, difficulty: 3, cat: "science" },
    { q: "Quel endocannabinoïde du corps tire son nom du sanskrit « ananda » (béatitude)?", options: ["Le 2-AG", "La dopamine", "L'anandamide", "La sérotonine"], answer: 2, difficulty: 3, cat: "science" },
    { q: "Quand le système endocannabinoïde a-t-il été découvert?", options: ["Dans les années 1960", "Dans les années 1990", "Dans les années 2010", "Au 19e siècle"], answer: 1, difficulty: 3, cat: "science" },
    { q: "Le CBG est surnommé…", options: ["Le cannabinoïde du sommeil", "La « mère » des cannabinoïdes", "Le faux THC", "Le terpène royal"], answer: 1, difficulty: 3, cat: "science" },
    { q: "Le CBN se forme quand…", options: ["Le THC s'oxyde et se dégrade avec le temps", "On ajoute du CBD", "La plante est jeune", "On presse les graines"], answer: 0, difficulty: 3, cat: "science" },
    { q: "Le houblon, cousin du cannabis, contient-il du THC?", options: ["Oui, autant", "Non", "Oui, mais seulement en été", "Seulement dans les bières fortes"], answer: 1, difficulty: 3, cat: "science" },
    { q: "À quelle température le THC se vaporise-t-il environ?", options: ["Autour de 60 °C", "Autour de 157 °C", "Autour de 300 °C", "Il ne se vaporise jamais"], answer: 1, difficulty: 3, cat: "science" },
    { q: "Le delta-8-THC est…", options: ["Un isomère du delta-9-THC, généralement moins puissant", "Un terpène", "Un pesticide", "Une moisissure"], answer: 0, difficulty: 3, cat: "science" },
    { q: "Le « runner's high » (euphorie du coureur) serait lié surtout à…", options: ["L'adrénaline uniquement", "Les endocannabinoïdes comme l'anandamide", "La caféine", "Le sucre"], answer: 1, difficulty: 3, cat: "science" },
    { q: "Le syndrome d'hyperémèse cannabinoïde touche surtout…", options: ["Les usagers occasionnels", "Les usagers chroniques à fortes doses", "Les enfants", "Les animaux"], answer: 1, difficulty: 3, cat: "science" },
    { q: "Quel autre endocannabinoïde majeur accompagne l'anandamide?", options: ["Le 2-AG", "Le GABA", "L'histamine", "L'insuline"], answer: 0, difficulty: 4, cat: "science" },
    { q: "Quelle enzyme dégrade l'anandamide dans le corps?", options: ["La FAAH", "La lipase", "L'amylase", "La pepsine"], answer: 0, difficulty: 4, cat: "science" },
    { q: "Quel médicament au CBD purifié a été approuvé en 2018 contre certaines épilepsies?", options: ["Le Marinol", "L'Epidiolex", "L'aspirine", "Le Tylenol"], answer: 1, difficulty: 4, cat: "science" },
    { q: "Les cannaflavines sont…", options: ["Des flavonoïdes uniques au cannabis, étudiés pour leurs effets anti-inflammatoires", "Des engrais", "Des lampes de culture", "Des variétés de haschich"], answer: 0, difficulty: 4, cat: "science" },
    { q: "L'anandamide a aussi été détectée dans…", options: ["L'eau de pluie", "Le lait maternel", "Le sable", "Le pétrole"], answer: 1, difficulty: 4, cat: "science" },
    { q: "Quel cannabinoïde a été isolé en premier, dès 1940?", options: ["Le THC", "Le CBD", "Le CBG", "Le CBN"], answer: 1, difficulty: 4, cat: "science" },
    { q: "En phase de croissance, on donne environ…", options: ["12 h de lumière par jour", "18 h de lumière par jour", "24 h de noirceur", "6 h de lumière par jour"], answer: 1, difficulty: 1, cat: "culture" },
    { q: "Pour déclencher la floraison, on passe à…", options: ["18 h de lumière / 6 h de noirceur", "12 h de lumière / 12 h de noirceur", "24 h de lumière", "0 h de lumière"], answer: 1, difficulty: 1, cat: "culture" },
    { q: "Le cannabis est une plante dioïque, ça veut dire…", options: ["Qu'elle a des plants mâles et des plants femelles séparés", "Qu'elle pousse dans l'eau", "Qu'elle fleurit deux fois par an", "Qu'elle n'a pas de graines"], answer: 0, difficulty: 1, cat: "culture" },
    { q: "Le cannabis est une plante…", options: ["Vivace", "Annuelle", "Bisannuelle", "Un arbre"], answer: 1, difficulty: 1, cat: "culture" },
    { q: "Que veut dire « sinsemilla »?", options: ["Petite graine", "Sans graines, en espagnol", "Fleur séchée", "Plante naine"], answer: 1, difficulty: 2, cat: "culture" },
    { q: "Pourquoi évite-t-on de polliniser les femelles?", options: ["Ça les rend toxiques", "Les fleurs font des graines et produisent moins de résine", "Ça attire les insectes", "Ça change leur couleur"], answer: 1, difficulty: 2, cat: "culture" },
    { q: "La floraison automatique vient de…", options: ["Cannabis sativa", "Cannabis ruderalis", "Cannabis indica", "Du chanvre textile"], answer: 1, difficulty: 2, cat: "culture" },
    { q: "Le clonage (bouturage) produit…", options: ["Une plante au hasard", "Une copie génétiquement identique", "Une plante mâle à coup sûr", "Des graines"], answer: 1, difficulty: 2, cat: "culture" },
    { q: "En croissance, la plante a surtout besoin d'…", options: ["Phosphore", "Azote", "Calcium", "Soufre"], answer: 1, difficulty: 2, cat: "culture" },
    { q: "On récolte au pic de THC quand les trichomes sont…", options: ["Transparents", "Laiteux", "Noirs", "Absents"], answer: 1, difficulty: 2, cat: "culture" },
    { q: "L'affinage (curing) se fait…", options: ["Au congélateur", "En pots hermétiques, en les aérant régulièrement", "Au soleil direct", "Dans l'eau"], answer: 1, difficulty: 2, cat: "culture" },
    { q: "Le « topping » consiste à…", options: ["Ajouter de l'engrais", "Couper l'apex pour multiplier les têtes", "Arroser par le haut", "Secouer la plante"], answer: 1, difficulty: 2, cat: "culture" },
    { q: "En floraison, quel spectre lumineux privilégie-t-on?", options: ["Le bleu", "Le rouge/orangé", "Le vert", "L'ultraviolet seul"], answer: 1, difficulty: 2, cat: "culture" },
    { q: "En croissance, on privilégie plutôt…", options: ["Le rouge", "Le bleu", "Le jaune", "L'infrarouge"], answer: 1, difficulty: 2, cat: "culture" },
    { q: "Quel minuscule ravageur tisse des toiles sous les feuilles?", options: ["Le puceron", "Le tétranyque (araignée rouge)", "La coccinelle", "Le ver de terre"], answer: 1, difficulty: 2, cat: "culture" },
    { q: "Un duvet blanc poudreux sur les feuilles, c'est probablement…", options: ["De la poussière", "L'oïdium (mildiou poudreux)", "Du pollen", "Du sucre"], answer: 1, difficulty: 2, cat: "culture" },
    { q: "Les plants mâles produisent-ils des fleurs riches en THC?", options: ["Oui, autant que les femelles", "Non, presque pas", "Seulement en hiver", "Oui, mais sans terpènes"], answer: 1, difficulty: 2, cat: "culture" },
    { q: "L'Hindu Kush est…", options: ["Une variété de café", "Une chaîne de montagnes d'Asie centrale", "Un engrais", "Un insecte"], answer: 1, difficulty: 2, cat: "culture" },
    { q: "En floraison, la plante a surtout besoin de…", options: ["Azote", "Phosphore et potassium", "Sodium", "Chlore"], answer: 1, difficulty: 3, cat: "culture" },
    { q: "Des trichomes bien ambrés donnent un effet…", options: ["Plus énergique", "Plus sédatif", "Psychédélique", "Aucun"], answer: 1, difficulty: 3, cat: "culture" },
    { q: "Le pH idéal d'un sol pour le cannabis se situe vers…", options: ["4,0 à 5,0", "6,0 à 7,0", "8,0 à 9,0", "2,0 à 3,0"], answer: 1, difficulty: 3, cat: "culture" },
    { q: "SCROG veut dire…", options: ["Screen of Green, un palissage sur grillage", "Un engrais", "Une lampe", "Une variété"], answer: 0, difficulty: 3, cat: "culture" },
    { q: "SOG veut dire…", options: ["Son of God", "Sea of Green, beaucoup de petits plants", "Un pesticide", "Un terreau"], answer: 1, difficulty: 3, cat: "culture" },
    { q: "Les « landraces » sont…", options: ["Des serres", "Des variétés d'origine géographique, stables depuis des générations", "Des graines modifiées", "Des engrais"], answer: 1, difficulty: 3, cat: "culture" },
    { q: "L'Acapulco Gold vient…", options: ["Du Mexique", "Du Maroc", "Du Népal", "De la Colombie"], answer: 0, difficulty: 3, cat: "culture" },
    { q: "Le « 60/60 » du séchage, c'est…", options: ["60 plants en 60 jours", "Environ 15 °C (60 °F) et 60 % d'humidité", "60 grammes en 60 heures", "Une variété"], answer: 1, difficulty: 3, cat: "culture" },
    { q: "Les graines féminisées se sont répandues dans les années…", options: ["1960", "1990", "2010", "1850"], answer: 1, difficulty: 3, cat: "culture" },
    { q: "Du chanvre planté à Tchernobyl servait à…", options: ["Nourrir les animaux", "La phytoremédiation : absorber les polluants du sol", "Faire de l'ombre", "Décorer"], answer: 1, difficulty: 3, cat: "culture" },
    { q: "La Durban Poison est une landrace d'…", options: ["Afrique du Sud", "Afghanistan", "Jamaïque", "Thaïlande"], answer: 0, difficulty: 4, cat: "culture" },
    { q: "En culture intérieure, le PPFD mesure…", options: ["Le pH", "L'intensité lumineuse reçue par les plantes", "La température", "L'humidité"], answer: 1, difficulty: 4, cat: "culture" },
    { q: "Quel pays a légalisé le cannabis le 17 octobre 2018?", options: ["Les États-Unis", "Le Canada", "La France", "L'Australie"], answer: 1, difficulty: 1, cat: "histoire" },
    { q: "Au Québec, l'âge légal pour acheter à la SQDC est…", options: ["18 ans", "19 ans", "21 ans", "25 ans"], answer: 2, difficulty: 1, cat: "histoire" },
    { q: "Quels États américains ont légalisé le récréatif en 2012?", options: ["La Californie et le Nevada", "Le Colorado et Washington", "Le Texas et la Floride", "New York et l'Oregon"], answer: 1, difficulty: 1, cat: "histoire" },
    { q: "Quel pays a été le premier au monde à légaliser le cannabis en 2013?", options: ["Le Canada", "L'Uruguay", "Les Pays-Bas", "Le Portugal"], answer: 1, difficulty: 2, cat: "histoire" },
    { q: "Quelle loi américaine de 1937 a criminalisé le cannabis?", options: ["Le Volstead Act", "Le Marihuana Tax Act", "Le Patriot Act", "Le Clean Air Act"], answer: 1, difficulty: 2, cat: "histoire" },
    { q: "Qui menait la croisade anti-cannabis aux USA dans les années 1930?", options: ["Al Capone", "Harry Anslinger", "John F. Kennedy", "Elvis Presley"], answer: 1, difficulty: 2, cat: "histoire" },
    { q: "Quel État a légalisé le cannabis médical en 1996?", options: ["Le Texas", "La Californie", "L'Alaska", "Hawaï"], answer: 1, difficulty: 2, cat: "histoire" },
    { q: "Depuis quand les Pays-Bas tolèrent-ils les coffee shops?", options: ["1950", "1976", "1990", "2010"], answer: 1, difficulty: 2, cat: "histoire" },
    { q: "Le chanvre servait historiquement surtout à…", options: ["Faire des bijoux", "Fabriquer cordes, voiles et textiles", "Construire des pyramides", "Faire du vin"], answer: 1, difficulty: 2, cat: "histoire" },
    { q: "On cultive le chanvre en Asie depuis…", options: ["500 ans", "Plus de 8 000 ans", "100 ans", "2 000 ans"], answer: 1, difficulty: 2, cat: "histoire" },
    { q: "D'où vient le « 420 »?", options: ["D'un article de loi", "De lycéens de San Rafael, en Californie (1971)", "D'une heure de fermeture", "D'un indicatif téléphonique"], answer: 1, difficulty: 2, cat: "histoire" },
    { q: "En quelle année le cannabis est-il devenu illégal au Canada?", options: ["1900", "1923", "1950", "1970"], answer: 1, difficulty: 2, cat: "histoire" },
    { q: "Le cannabis médical est encadré au Canada depuis…", options: ["1980", "2001", "2018", "1990"], answer: 1, difficulty: 2, cat: "histoire" },
    { q: "Quels présidents américains cultivaient du chanvre?", options: ["Lincoln et Roosevelt", "Washington et Jefferson", "Kennedy et Nixon", "Reagan et Bush"], answer: 1, difficulty: 2, cat: "histoire" },
    { q: "La SQDC a été créée en…", options: ["2001", "1996", "2018", "2010"], answer: 2, difficulty: 2, cat: "histoire" },
    { q: "Qui a décrit l'usage rituel du cannabis chez les Scythes vers 440 av. J.-C.?", options: ["Platon", "Hérodote", "Aristote", "Socrate"], answer: 1, difficulty: 3, cat: "histoire" },
    { q: "Le « charas » frotté à la main vient de…", options: ["L'Inde et l'Himalaya", "Le Mexique", "Le Maroc", "La Jamaïque"], answer: 0, difficulty: 3, cat: "histoire" },
    { q: "Qui a introduit le cannabis en médecine occidentale en 1839?", options: ["Louis Pasteur", "William O'Shaughnessy", "Joseph Lister", "Edward Jenner"], answer: 1, difficulty: 3, cat: "histoire" },
    { q: "Que buvaient les dévots de Shiva en Inde?", options: ["Du thé", "Du bhang, une boisson au cannabis", "Du café", "Du vin"], answer: 1, difficulty: 3, cat: "histoire" },
    { q: "Qui a nommé Cannabis sativa en 1753?", options: ["Darwin", "Linné", "Lamarck", "Mendel"], answer: 1, difficulty: 3, cat: "histoire" },
    { q: "Et Cannabis indica, en 1785?", options: ["Linné", "Darwin", "Lamarck", "Buffon"], answer: 2, difficulty: 3, cat: "histoire" },
    { q: "Que concluait le rapport La Guardia (1944) sur le cannabis?", options: ["Qu'il mène à la criminalité", "Qu'il ne mène pas à la criminalité", "Qu'il est mortel", "Qu'il guérit tout"], answer: 1, difficulty: 3, cat: "histoire" },
    { q: "Quel film de propagande de 1936 diabolisait le cannabis?", options: ["King Kong", "Reefer Madness", "Casablanca", "Metropolis"], answer: 1, difficulty: 3, cat: "histoire" },
    { q: "D'où vient le mot « marijuana »?", options: ["Du portugais", "De l'espagnol mexicain", "Du chinois", "De l'arabe"], answer: 1, difficulty: 3, cat: "histoire" },
    { q: "Quel empereur légendaire chinois est lié au plus vieux traité mentionnant le cannabis?", options: ["Qin Shi Huang", "Shen Nung", "Kubilaï Khan", "Sun Tzu"], answer: 1, difficulty: 3, cat: "histoire" },
    { q: "Quel club parisien réunissait Baudelaire et Gautier autour du haschich dans les années 1840?", options: ["Le Club des Hashischins", "Le Moulin Rouge", "L'Académie française", "Le Café de Flore"], answer: 0, difficulty: 4, cat: "histoire" },
    { q: "En 1798, quelles troupes découvrent le haschich en Égypte?", options: ["Les Anglais", "Les troupes de Napoléon", "Les Ottomans", "Les Romains"], answer: 1, difficulty: 4, cat: "histoire" },
    { q: "Quelle découverte de 2019 a prouvé qu'on brûlait du cannabis il y a 2 500 ans?", options: ["Des brûle-parfums du Pamir, en Asie centrale", "Une pipe en Irlande", "Un texte maya", "Une fresque romaine"], answer: 0, difficulty: 4, cat: "histoire" },
    { q: "À Tel Arad, on a trouvé des résidus de cannabis vieux de 2 700 ans sur…", options: ["Un autel du royaume de Juda", "Une épée", "Un bateau", "Un mur d'école"], answer: 0, difficulty: 4, cat: "histoire" },
    { q: "Le mot « cannabis » vient…", options: ["Du grec kannabis", "De l'anglais moderne", "Du japonais", "De l'inuktitut"], answer: 0, difficulty: 4, cat: "histoire" }
  ];

  var DATA = {
    shiftName: 'Initiation · Service au comptoir',
    quests: QUESTS,
    quiz: QUIZ,
    deckOrder: DECK_ORDER,
    duelQuestions: DUEL_QUESTIONS,
    duelCount: 20,
    duelMs: 15000,
    quizReward: 15,
    turnMs: 20000,
    teamPresets: [
      { name: 'Indica', color: '#7b5fc9', emoji: '🛋️' },
      { name: 'Sativa', color: '#e8a13c', emoji: '⚡' },
      { name: 'Hybride', color: '#62a35e', emoji: '🌿' },
      { name: 'CBD', color: '#4d9db5', emoji: '💧' }
    ]
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DATA;
  } else {
    root.GAME_DATA = DATA;
  }
})(typeof self !== 'undefined' ? self : this);
