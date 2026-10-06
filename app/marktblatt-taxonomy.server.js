/*
 * =========================================================
 * MARKTBLATT EIGENE PRODUKT-TAXONOMIE
 * =========================================================
 *
 * Diese Taxonomie steuert:
 *
 * - Marktblatt Hauptkategorien
 * - Marktblatt Unterkategorien
 * - KI-Klassifizierung
 * - Produkt-Tags
 * - automatische Shopify-Kollektionen
 *
 * WICHTIG:
 *
 * Die IDs sind dauerhaft und dürfen später nicht einfach
 * geändert werden, da sie für Tags und Zuordnungen
 * verwendet werden.
 *
 * Sichtbare Namen können dagegen später geändert werden.
 */


export const MARKTBLATT_TAXONOMY = [

  /*
   * =======================================================
   * ELEKTRONIK & TECHNIK
   * =======================================================
   */

  {
    id: "electronics",
    name: "Elektronik & Technik",

    subcategories: [
      ["smart-home", "Smart Home"],
      ["security-technology", "Sicherheitstechnik"],
      ["surveillance-cameras", "Überwachungskameras"],
      ["alarm-systems", "Alarmanlagen"],
      ["doorbells-intercoms", "Türklingeln & Gegensprechanlagen"],
      ["gps-tracking", "GPS & Ortung"],
      ["radios", "Funkgeräte"],
      ["weather-stations", "Wetterstationen"],
      ["measuring-devices", "Messgeräte"],
      ["batteries", "Batterien & Akkus"],
      ["chargers-power-supplies", "Ladegeräte & Netzteile"],
      ["cables-adapters", "Kabel & Adapter"],
      ["sockets-power-strips", "Steckdosen & Steckdosenleisten"],
      ["electronic-components", "Elektronische Bauteile"],
      ["flashlights", "Taschenlampen"],
      ["technology-accessories", "Technik-Zubehör"],
    ],
  },


  /*
   * =======================================================
   * COMPUTER
   * =======================================================
   */

  {
    id: "computers",
    name: "Computer & Zubehör",

    subcategories: [
      ["notebooks", "Notebooks"],
      ["desktop-pcs", "Desktop-PCs"],
      ["gaming-pcs", "Gaming-PCs"],
      ["monitors", "Monitore"],
      ["pc-components", "PC-Komponenten"],
      ["graphics-cards", "Grafikkarten"],
      ["processors", "Prozessoren"],
      ["mainboards", "Mainboards"],
      ["memory", "Arbeitsspeicher"],
      ["storage", "Festplatten & SSDs"],
      ["pc-cases", "PC-Gehäuse"],
      ["pc-power-supplies", "PC-Netzteile"],
      ["pc-cooling", "PC-Kühlung"],
      ["keyboards", "Tastaturen"],
      ["computer-mice", "Mäuse"],
      ["computer-headsets", "Headsets"],
      ["webcams", "Webcams"],
      ["printers", "Drucker"],
      ["scanners", "Scanner"],
      ["printer-accessories", "Druckerzubehör"],
      ["networking", "Netzwerk & WLAN"],
      ["routers", "Router"],
      ["nas", "NAS & Netzwerkspeicher"],
      ["usb-storage", "USB-Sticks & Speicherkarten"],
      ["computer-accessories", "Computer-Zubehör"],
      ["software", "Software"],
    ],
  },


  /*
   * =======================================================
   * HANDYS / TABLETS / WEARABLES
   * =======================================================
   */

  {
    id: "mobile",
    name: "Handys, Tablets & Wearables",

    subcategories: [
      ["smartphones", "Smartphones"],
      ["mobile-phones", "Handys"],
      ["tablets", "Tablets"],
      ["smartwatches", "Smartwatches"],
      ["fitness-trackers", "Fitness-Tracker"],
      ["phone-cases", "Handyhüllen"],
      ["screen-protectors", "Displayschutz"],
      ["mobile-chargers", "Ladegeräte"],
      ["charging-cables", "Ladekabel"],
      ["powerbanks", "Powerbanks"],
      ["phone-mounts", "Handyhalterungen"],
      ["mobile-headphones", "Kopfhörer"],
      ["bluetooth-accessories", "Bluetooth-Zubehör"],
      ["mobile-spare-parts", "Ersatzteile"],
      ["tablet-accessories", "Tablet-Zubehör"],
      ["smartwatch-accessories", "Smartwatch-Zubehör"],
    ],
  },


  /*
   * =======================================================
   * TV / AUDIO / FOTO
   * =======================================================
   */

  {
    id: "tv-audio-photo",
    name: "TV, Audio & Foto",

    subcategories: [
      ["televisions", "Fernseher"],
      ["projectors", "Beamer"],
      ["streaming-devices", "Streaming-Geräte"],
      ["receivers", "Receiver"],
      ["tv-accessories", "TV-Zubehör"],
      ["speakers", "Lautsprecher"],
      ["bluetooth-speakers", "Bluetooth-Lautsprecher"],
      ["soundbars", "Soundbars"],
      ["hifi-systems", "HiFi-Anlagen"],
      ["audio-amplifiers", "Verstärker"],
      ["headphones", "Kopfhörer"],
      ["radios-audio", "Radios"],
      ["turntables", "Plattenspieler"],
      ["digital-cameras", "Digitalkameras"],
      ["dslr-cameras", "Spiegelreflexkameras"],
      ["mirrorless-cameras", "Systemkameras"],
      ["action-cameras", "Actioncams"],
      ["camera-lenses", "Objektive"],
      ["tripods", "Stative"],
      ["camera-flashes", "Blitzgeräte"],
      ["camera-accessories", "Kamera-Zubehör"],
      ["binoculars-optics", "Ferngläser & Optik"],
    ],
  },


  /*
   * =======================================================
   * HAUSHALT
   * =======================================================
   */

  {
    id: "household",
    name: "Haushalt & Haushaltsgeräte",

    subcategories: [
      ["vacuum-cleaners", "Staubsauger"],
      ["robot-vacuums", "Saugroboter"],
      ["cleaning-appliances", "Reinigungsgeräte"],
      ["washing-machines", "Waschmaschinen"],
      ["dryers", "Wäschetrockner"],
      ["irons", "Bügeleisen"],
      ["ironing-stations", "Bügelstationen"],
      ["sewing-machines", "Nähmaschinen"],
      ["air-conditioners", "Klimageräte"],
      ["fans", "Ventilatoren"],
      ["air-purifiers", "Luftreiniger"],
      ["humidifiers", "Luftbefeuchter"],
      ["heaters", "Heizgeräte"],
      ["household-cleaning", "Haushaltsreinigung"],
      ["laundry-detergent", "Waschmittel"],
      ["storage-organization", "Aufbewahrung & Ordnung"],
      ["household-helpers", "Haushaltshelfer"],
    ],
  },


  /*
   * =======================================================
   * KÜCHE
   * =======================================================
   */

  {
    id: "kitchen",
    name: "Küche & Kochen",

    subcategories: [
      ["refrigerators", "Kühlschränke"],
      ["freezers", "Gefrierschränke"],
      ["dishwashers", "Geschirrspüler"],
      ["ovens", "Backöfen"],
      ["cooktops", "Kochfelder"],
      ["microwaves", "Mikrowellen"],
      ["coffee-makers", "Kaffeemaschinen"],
      ["automatic-coffee-machines", "Kaffeevollautomaten"],
      ["kettles", "Wasserkocher"],
      ["toasters", "Toaster"],
      ["blenders", "Mixer"],
      ["food-processors", "Küchenmaschinen"],
      ["air-fryers", "Heißluftfritteusen"],
      ["deep-fryers", "Fritteusen"],
      ["indoor-grills", "Küchengrills"],
      ["pots", "Töpfe"],
      ["pans", "Pfannen"],
      ["kitchen-knives", "Messer"],
      ["cutlery", "Besteck"],
      ["tableware", "Geschirr"],
      ["glassware", "Gläser"],
      ["kitchen-tools", "Küchenhelfer"],
      ["baking-accessories", "Backzubehör"],
      ["food-storage", "Vorratsbehälter"],
      ["drinking-bottles", "Trinkflaschen"],
    ],
  },


  /*
   * =======================================================
   * MÖBEL & WOHNEN
   * =======================================================
   */

  {
    id: "home-living",
    name: "Möbel & Wohnen",

    subcategories: [
      ["living-room-furniture", "Wohnzimmermöbel"],
      ["sofas", "Sofas & Couches"],
      ["armchairs", "Sessel"],
      ["tables", "Tische"],
      ["chairs", "Stühle"],
      ["cabinets", "Schränke"],
      ["shelves", "Regale"],
      ["bedroom-furniture", "Schlafzimmermöbel"],
      ["beds", "Betten"],
      ["mattresses", "Matratzen"],
      ["slatted-frames", "Lattenroste"],
      ["childrens-furniture", "Kinderzimmermöbel"],
      ["office-furniture", "Büromöbel"],
      ["lamps-lighting", "Lampen & Leuchten"],
      ["rugs", "Teppiche"],
      ["curtains", "Gardinen & Vorhänge"],
      ["pillows", "Kissen"],
      ["blankets", "Decken"],
      ["bed-linen", "Bettwäsche"],
      ["towels", "Handtücher"],
      ["mirrors", "Spiegel"],
      ["wall-decoration", "Wanddekoration"],
      ["pictures-posters", "Bilder & Poster"],
      ["vases", "Vasen"],
      ["candles-fragrance", "Kerzen & Duft"],
      ["home-accessories", "Wohnaccessoires"],
    ],
  },


  /*
   * =======================================================
   * GARTEN
   * =======================================================
   */

  {
    id: "garden",
    name: "Garten & Outdoor",

    subcategories: [
      ["garden-furniture", "Gartenmöbel"],
      ["garden-decoration", "Gartendekoration"],
      ["plant-pots", "Pflanzgefäße"],
      ["plants", "Pflanzen"],
      ["seeds", "Samen"],
      ["fertilizers", "Dünger"],
      ["soil-substrates", "Erde & Substrate"],
      ["garden-irrigation", "Gartenbewässerung"],
      ["garden-hoses", "Gartenschläuche"],
      ["lawn-care", "Rasenpflege"],
      ["lawn-mowers", "Rasenmäher"],
      ["robot-mowers", "Mähroboter"],
      ["hedge-trimmers", "Heckenscheren"],
      ["chainsaws", "Kettensägen"],
      ["garden-tools", "Gartengeräte"],
      ["pressure-washers", "Hochdruckreiniger"],
      ["pools", "Pools"],
      ["pool-accessories", "Poolzubehör"],
      ["hot-tubs", "Whirlpools"],
      ["outdoor-grills", "Grills"],
      ["grill-accessories", "Grillzubehör"],
      ["parasols", "Sonnenschirme"],
      ["pavilions", "Pavillons"],
      ["garden-houses", "Gartenhäuser"],
      ["greenhouses", "Gewächshäuser"],
      ["fences-privacy", "Zäune & Sichtschutz"],
    ],
  },


  /*
   * =======================================================
   * BAUMARKT
   * =======================================================
   */

  {
    id: "diy-tools",
    name: "Baumarkt & Werkzeuge",

    subcategories: [
      ["power-tools", "Elektrowerkzeuge"],
      ["cordless-screwdrivers", "Akkuschrauber"],
      ["drills", "Bohrmaschinen"],
      ["saws", "Sägen"],
      ["grinders", "Schleifmaschinen"],
      ["hand-tools", "Handwerkzeuge"],
      ["tool-sets", "Werkzeugsets"],
      ["tool-cases", "Werkzeugkoffer"],
      ["measuring-tools", "Messwerkzeuge"],
      ["ladders", "Leitern"],
      ["workbenches", "Arbeitsböcke"],
      ["screws-fasteners", "Schrauben & Befestigung"],
      ["hardware", "Eisenwaren"],
      ["paints-varnishes", "Farben & Lacke"],
      ["painting-accessories", "Malerzubehör"],
      ["building-materials", "Baustoffe"],
      ["wood", "Holz"],
      ["flooring", "Bodenbeläge"],
      ["tiles", "Fliesen"],
      ["sanitary", "Sanitär"],
      ["bathroom", "Bad"],
      ["faucets", "Armaturen"],
      ["electrical-installation", "Elektroinstallation"],
      ["building-lighting", "Beleuchtung"],
      ["heating", "Heizung"],
      ["ventilation", "Klima & Lüftung"],
      ["occupational-safety", "Arbeitsschutz"],
    ],
  },


  /*
   * =======================================================
   * MODE
   * =======================================================
   */

  {
    id: "fashion",
    name: "Mode & Bekleidung",

    subcategories: [
      ["womens-clothing", "Damenmode"],
      ["mens-clothing", "Herrenmode"],
      ["childrens-clothing", "Kindermode"],
      ["jackets-coats", "Jacken & Mäntel"],
      ["sweaters-knitwear", "Pullover & Strick"],
      ["shirts-tops", "Shirts & Tops"],
      ["mens-shirts", "Hemden"],
      ["blouses", "Blusen"],
      ["trousers", "Hosen"],
      ["jeans", "Jeans"],
      ["dresses", "Kleider"],
      ["skirts", "Röcke"],
      ["suits", "Anzüge"],
      ["underwear", "Unterwäsche"],
      ["socks", "Socken"],
      ["nightwear", "Nachtwäsche"],
      ["swimwear", "Bademode"],
      ["workwear", "Arbeitskleidung"],
      ["traditional-clothing", "Trachten"],
      ["costumes", "Kostüme"],
    ],
  },


  /*
   * =======================================================
   * SCHUHE / TASCHEN / ACCESSOIRES
   * =======================================================
   */

  {
    id: "shoes-bags",
    name: "Schuhe, Taschen & Accessoires",

    subcategories: [
      ["womens-shoes", "Damenschuhe"],
      ["mens-shoes", "Herrenschuhe"],
      ["childrens-shoes", "Kinderschuhe"],
      ["sneakers", "Sneaker"],
      ["sports-shoes", "Sportschuhe"],
      ["boots", "Stiefel"],
      ["sandals", "Sandalen"],
      ["slippers", "Hausschuhe"],
      ["handbags", "Handtaschen"],
      ["shoulder-bags", "Umhängetaschen"],
      ["fashion-backpacks", "Rucksäcke"],
      ["wallets", "Geldbörsen"],
      ["belts", "Gürtel"],
      ["hats-caps", "Mützen & Hüte"],
      ["scarves", "Schals & Tücher"],
      ["gloves", "Handschuhe"],
      ["sunglasses", "Sonnenbrillen"],
      ["fashion-accessories", "Modeaccessoires"],
    ],
  },


  /*
   * =======================================================
   * UHREN & SCHMUCK
   * =======================================================
   */

  {
    id: "jewelry-watches",
    name: "Uhren & Schmuck",

    subcategories: [
      ["watches", "Armbanduhren"],
      ["pocket-watches", "Taschenuhren"],
      ["watch-accessories", "Uhrenzubehör"],
      ["rings", "Ringe"],
      ["necklaces", "Halsketten"],
      ["pendants", "Anhänger"],
      ["earrings", "Ohrringe"],
      ["bracelets", "Armbänder"],
      ["bangles", "Armreifen"],
      ["brooches", "Broschen"],
      ["anklets", "Fußketten"],
      ["body-jewelry", "Körperschmuck"],
      ["jewelry-accessories", "Schmuckzubehör"],
      ["jewelry-storage", "Schmuckaufbewahrung"],
    ],
  },


  /*
   * =======================================================
   * BEAUTY
   * =======================================================
   */

  {
    id: "beauty",
    name: "Beauty & Körperpflege",

    subcategories: [
      ["face-care", "Gesichtspflege"],
      ["body-care", "Körperpflege"],
      ["hand-care", "Handpflege"],
      ["foot-care", "Fußpflege"],
      ["hair-care", "Haarpflege"],
      ["shampoo-conditioner", "Shampoo & Conditioner"],
      ["hair-styling", "Haarstyling"],
      ["hair-color", "Haarfarben"],
      ["makeup", "Make-up"],
      ["nail-care", "Nagelpflege"],
      ["perfume", "Parfüm"],
      ["womens-fragrances", "Düfte für Damen"],
      ["mens-fragrances", "Düfte für Herren"],
      ["shaving", "Rasur"],
      ["beard-care", "Bartpflege"],
      ["dental-care", "Zahnpflege"],
      ["electric-toothbrushes", "Elektrische Zahnbürsten"],
      ["electric-shavers", "Rasierer"],
      ["hair-dryers", "Haartrockner"],
      ["hair-straighteners", "Glätteisen"],
      ["curling-irons", "Lockenstäbe"],
      ["beauty-devices", "Beauty-Geräte"],
      ["beauty-accessories", "Beauty-Zubehör"],
    ],
  },


  /*
   * =======================================================
   * GESUNDHEIT
   * =======================================================
   */

  {
    id: "health-wellness",
    name: "Gesundheit & Wellness",

    subcategories: [
      ["supplements", "Nahrungsergänzung"],
      ["vitamins-minerals", "Vitamine & Mineralstoffe"],
      ["first-aid", "Erste Hilfe"],
      ["bandages", "Verbandsmaterial"],
      ["health-measuring-devices", "Gesundheits-Messgeräte"],
      ["blood-pressure-monitors", "Blutdruckmessgeräte"],
      ["thermometers", "Fieberthermometer"],
      ["massage-devices", "Massagegeräte"],
      ["heat-products", "Wärmeprodukte"],
      ["relaxation", "Entspannung"],
      ["sleep-recovery", "Schlaf & Erholung"],
      ["wellness-products", "Wellnessprodukte"],
      ["sauna-accessories", "Saunazubehör"],
      ["incontinence-products", "Inkontinenzprodukte"],
      ["mobility-aids", "Mobilitätshilfen"],
      ["daily-living-aids", "Alltagshilfen"],
    ],
  },


  /*
   * =======================================================
   * SPORT
   * =======================================================
   */

  {
    id: "sports",
    name: "Sport & Fitness",

    subcategories: [
      ["fitness", "Fitness"],
      ["strength-training", "Krafttraining"],
      ["weights", "Hanteln & Gewichte"],
      ["fitness-equipment", "Fitnessgeräte"],
      ["yoga", "Yogazubehör"],
      ["pilates", "Pilates"],
      ["running", "Laufen"],
      ["football", "Fußball"],
      ["handball", "Handball"],
      ["basketball", "Basketball"],
      ["tennis", "Tennis"],
      ["badminton", "Badminton"],
      ["table-tennis", "Tischtennis"],
      ["golf", "Golf"],
      ["cycling-sport", "Radsport"],
      ["swimming", "Schwimmen"],
      ["water-sports", "Wassersport"],
      ["winter-sports", "Wintersport"],
      ["martial-arts", "Kampfsport"],
      ["equestrian-sport", "Reitsport"],
      ["sports-clothing", "Sportbekleidung"],
      ["sports-bags", "Sporttaschen"],
      ["sports-nutrition", "Sporternährung"],
    ],
  },


  /*
   * =======================================================
   * CAMPING / FREIZEIT / OUTDOOR
   * =======================================================
   */

  {
    id: "outdoor-leisure",
    name: "Camping, Freizeit & Outdoor",

    subcategories: [
      ["camping", "Camping"],
      ["tents", "Zelte"],
      ["sleeping-bags", "Schlafsäcke"],
      ["camping-furniture", "Campingmöbel"],
      ["camping-stoves", "Campingkocher"],
      ["hiking", "Wandern"],
      ["trekking", "Trekking"],
      ["climbing", "Klettern"],
      ["fishing", "Angeln"],
      ["hunting", "Jagd"],
      ["boats-accessories", "Boote & Zubehör"],
      ["sup", "SUP"],
      ["kayaks-canoes", "Kajaks & Kanus"],
      ["bicycles", "Fahrräder"],
      ["e-bikes", "E-Bikes"],
      ["bicycle-accessories", "Fahrrad-Zubehör"],
      ["outdoor-games", "Freizeitspiele"],
      ["picnic", "Picknick"],
      ["outdoor-equipment", "Outdoor-Ausrüstung"],
    ],
  },


  /*
   * =======================================================
   * SPIELZEUG
   * =======================================================
   */

  {
    id: "toys",
    name: "Spielzeug & Spiele",

    subcategories: [
      ["baby-toys", "Babyspielzeug"],
      ["educational-toys", "Lernspielzeug"],
      ["wooden-toys", "Holzspielzeug"],
      ["dolls", "Puppen"],
      ["doll-accessories", "Puppenzubehör"],
      ["action-figures", "Actionfiguren"],
      ["toy-vehicles", "Spielfahrzeuge"],
      ["building-sets", "Baukästen"],
      ["construction-toys", "Konstruktionsspielzeug"],
      ["model-building-toys", "Modellbau"],
      ["board-games", "Brettspiele"],
      ["card-games", "Kartenspiele"],
      ["puzzles", "Puzzle"],
      ["family-games", "Gesellschaftsspiele"],
      ["outdoor-toys", "Outdoor-Spielzeug"],
      ["childrens-vehicles", "Kinderfahrzeuge"],
      ["plush-toys", "Kuscheltiere"],
      ["science-kits", "Experimentierkästen"],
      ["electronic-toys", "Elektronisches Spielzeug"],
      ["collectible-figures", "Sammelfiguren"],
    ],
  },


  /*
   * =======================================================
   * GAMING
   * =======================================================
   */

  {
    id: "gaming",
    name: "Gaming",

    subcategories: [
      ["game-consoles", "Spielekonsolen"],
      ["pc-gaming", "PC-Gaming"],
      ["console-games", "Konsolenspiele"],
      ["pc-games", "PC-Spiele"],
      ["gaming-controllers", "Gaming-Controller"],
      ["gaming-keyboards", "Gaming-Tastaturen"],
      ["gaming-mice", "Gaming-Mäuse"],
      ["gaming-headsets", "Gaming-Headsets"],
      ["gaming-monitors", "Gaming-Monitore"],
      ["gaming-chairs", "Gaming-Stühle"],
      ["vr-headsets", "VR-Brillen"],
      ["gaming-accessories", "Gaming-Zubehör"],
    ],
  },


  /*
   * =======================================================
   * BABY & KINDER
   * =======================================================
   */

  {
    id: "baby-kids",
    name: "Baby & Kinder",

    subcategories: [
      ["baby-clothing", "Babykleidung"],
      ["kids-clothing", "Kinderkleidung"],
      ["baby-shoes", "Babyschuhe"],
      ["strollers", "Kinderwagen"],
      ["buggies", "Buggys"],
      ["child-car-seats", "Autositze"],
      ["baby-carriers", "Babytragen"],
      ["baby-beds", "Babybetten"],
      ["baby-mattresses", "Babymatratzen"],
      ["high-chairs", "Hochstühle"],
      ["diapering", "Wickeln"],
      ["diapers", "Windeln"],
      ["baby-food", "Babyernährung"],
      ["baby-bottles", "Flaschen & Zubehör"],
      ["breastfeeding", "Stillen"],
      ["pacifiers", "Schnuller"],
      ["baby-monitors", "Babyphone"],
      ["child-safety", "Kindersicherheit"],
      ["nursery", "Kinderzimmer"],
    ],
  },


  /*
   * =======================================================
   * TIERBEDARF
   * =======================================================
   */

  {
    id: "pets",
    name: "Tierbedarf",

    subcategories: [
      ["dog-supplies", "Hundebedarf"],
      ["dog-food", "Hundefutter"],
      ["dog-toys", "Hundespielzeug"],
      ["dog-beds", "Hundebetten"],
      ["collars-leashes", "Halsbänder & Leinen"],
      ["cat-supplies", "Katzenbedarf"],
      ["cat-food", "Katzenfutter"],
      ["cat-toys", "Katzenspielzeug"],
      ["cat-trees", "Kratzbäume"],
      ["cat-litter", "Katzenstreu"],
      ["small-animal-supplies", "Kleintierbedarf"],
      ["bird-supplies", "Vogelbedarf"],
      ["aquariums", "Aquaristik"],
      ["terrariums", "Terraristik"],
      ["horse-supplies", "Pferdebedarf"],
      ["pet-care", "Tierpflege"],
      ["pet-carriers", "Transportboxen"],
      ["pet-food-snacks", "Futter & Snacks"],
    ],
  },


  /*
   * =======================================================
   * FAHRZEUGE
   * =======================================================
   */

  {
    id: "vehicles",
    name: "Auto, Motorrad & Fahrzeuge",

    subcategories: [
      ["car-parts", "Autoteile"],
      ["car-accessories", "Autozubehör"],
      ["tires", "Reifen"],
      ["rims", "Felgen"],
      ["vehicle-batteries", "Fahrzeugbatterien"],
      ["motor-oil-fluids", "Motoröl & Betriebsstoffe"],
      ["car-care", "Autopflege"],
      ["car-electronics", "Autoelektronik"],
      ["vehicle-navigation", "Navigation"],
      ["dashcams", "Dashcams"],
      ["car-interior", "Innenausstattung"],
      ["roof-racks-transport", "Dachträger & Transport"],
      ["trailers-accessories", "Anhänger & Zubehör"],
      ["motorcycle-parts", "Motorradteile"],
      ["motorcycle-accessories", "Motorradzubehör"],
      ["motorcycle-clothing", "Motorradbekleidung"],
      ["motorcycle-helmets", "Motorradhelme"],
      ["scooters-accessories", "Roller & Zubehör"],
      ["motorhomes-caravans", "Wohnmobil & Caravan"],
      ["motorhome-accessories", "Wohnmobilzubehör"],
      ["vehicle-emobility", "E-Mobilität"],
      ["escooter-accessories", "E-Scooter-Zubehör"],
    ],
  },


  /*
   * =======================================================
   * REISEN
   * =======================================================
   */

  {
    id: "travel",
    name: "Reisen & Gepäck",

    subcategories: [
      ["suitcases", "Koffer"],
      ["travel-bags", "Reisetaschen"],
      ["travel-backpacks", "Reiserucksäcke"],
      ["hand-luggage", "Handgepäck"],
      ["toiletry-bags", "Kulturbeutel"],
      ["travel-pillows", "Reisekissen"],
      ["travel-adapters", "Reiseadapter"],
      ["luggage-accessories", "Gepäckzubehör"],
      ["travel-organization", "Reiseorganisation"],
      ["travel-security", "Reisesicherheit"],
      ["travel-camping", "Camping-Reisebedarf"],
      ["beach-accessories", "Strandzubehör"],
    ],
  },


  /*
   * =======================================================
   * BÜRO / SCHULE
   * =======================================================
   */

  {
    id: "office-school",
    name: "Büro, Schule & Schreibwaren",

    subcategories: [
      ["stationery", "Schreibwaren"],
      ["pens", "Stifte"],
      ["paper", "Papier"],
      ["notebooks-paper", "Notizbücher"],
      ["calendars", "Kalender"],
      ["binders", "Ordner"],
      ["filing-organization", "Ablage & Organisation"],
      ["office-supplies", "Bürobedarf"],
      ["school-supplies", "Schulbedarf"],
      ["school-bags", "Schulranzen"],
      ["pencil-cases", "Federmäppchen"],
      ["calculators", "Taschenrechner"],
      ["labels", "Etiketten"],
      ["shipping-materials", "Versandmaterial"],
      ["packaging-materials", "Verpackungsmaterial"],
      ["presentation-supplies", "Präsentationsbedarf"],
    ],
  },


  /*
   * =======================================================
   * LEBENSMITTEL
   * =======================================================
   */

  {
    id: "food-drinks",
    name: "Lebensmittel & Getränke",

    subcategories: [
      ["coffee", "Kaffee"],
      ["tea", "Tee"],
      ["cocoa", "Kakao"],
      ["water", "Wasser"],
      ["juices", "Säfte"],
      ["soft-drinks", "Erfrischungsgetränke"],
      ["general-food", "Lebensmittel"],
      ["sweets", "Süßigkeiten"],
      ["chocolate", "Schokolade"],
      ["snacks", "Snacks"],
      ["nuts", "Nüsse"],
      ["breakfast", "Frühstück"],
      ["muesli", "Müsli"],
      ["pasta-rice", "Nudeln & Reis"],
      ["canned-food", "Konserven"],
      ["sauces", "Saucen"],
      ["spices", "Gewürze"],
      ["oils-vinegar", "Öle & Essig"],
      ["baking-ingredients", "Backzutaten"],
      ["delicatessen", "Feinkost"],
      ["international-food", "Internationale Lebensmittel"],
      ["organic-food", "Bio-Lebensmittel"],
      ["vegan-food", "Vegane Lebensmittel"],
      ["vegetarian-food", "Vegetarische Lebensmittel"],
    ],
  },


  /*
   * =======================================================
   * HOBBY & KREATIVITÄT
   * =======================================================
   */

  {
    id: "crafts",
    name: "Hobby, Basteln & Kreativität",

    subcategories: [
      ["craft-supplies", "Bastelbedarf"],
      ["painting-drawing", "Malen & Zeichnen"],
      ["artist-supplies", "Künstlerbedarf"],
      ["canvases", "Leinwände"],
      ["artist-colors", "Künstlerfarben"],
      ["sewing", "Nähen"],
      ["fabrics", "Stoffe"],
      ["yarn", "Wolle"],
      ["knitting-crochet", "Stricken & Häkeln"],
      ["jewelry-making", "Schmuckherstellung"],
      ["model-building", "Modellbau"],
      ["collecting", "Sammeln"],
      ["coins", "Münzen"],
      ["stamps", "Briefmarken"],
      ["handicrafts", "Handarbeit"],
      ["diy-crafts", "DIY"],
      ["scrapbooking", "Scrapbooking"],
      ["floristry", "Floristik"],
    ],
  },


  /*
   * =======================================================
   * BÜCHER / FILME / MUSIK
   * =======================================================
   */

  {
    id: "books-media",
    name: "Bücher, Filme & Musik",

    subcategories: [
      ["books", "Bücher"],
      ["novels", "Romane"],
      ["nonfiction", "Sachbücher"],
      ["childrens-books", "Kinderbücher"],
      ["school-books", "Schulbücher"],
      ["professional-books", "Fachbücher"],
      ["guides", "Ratgeber"],
      ["comics-manga", "Comics & Manga"],
      ["magazines", "Zeitschriften"],
      ["audiobooks", "Hörbücher"],
      ["movies", "Filme"],
      ["tv-series", "Serien"],
      ["dvd-bluray", "DVDs & Blu-rays"],
      ["music", "Musik"],
      ["cds", "CDs"],
      ["vinyl", "Vinyl"],
    ],
  },


  /*
   * =======================================================
   * MUSIKINSTRUMENTE
   * =======================================================
   */

  {
    id: "music-instruments",
    name: "Musikinstrumente & Studio",

    subcategories: [
      ["guitars", "Gitarren"],
      ["bass-guitars", "Bässe"],
      ["keyboards-instruments", "Keyboards"],
      ["pianos", "Klaviere"],
      ["drums", "Schlagzeug"],
      ["wind-instruments", "Blasinstrumente"],
      ["string-instruments", "Streichinstrumente"],
      ["dj-equipment", "DJ-Equipment"],
      ["studio-equipment", "Studioequipment"],
      ["microphones", "Mikrofone"],
      ["mixers", "Mischpulte"],
      ["instrument-amplifiers", "Instrumentenverstärker"],
      ["pa-speakers", "PA-Lautsprecher"],
      ["instrument-accessories", "Instrumentenzubehör"],
      ["sheet-music", "Noten"],
    ],
  },


  /*
   * =======================================================
   * GESCHENKE
   * =======================================================
   *
   * Diese Gruppe kann später als zusätzliche thematische
   * Zuordnung verwendet werden. Sie ersetzt NICHT die
   * primäre Produktkategorie.
   */

  {
    id: "gifts",
    name: "Geschenke & Anlässe",
    secondary: true,

    subcategories: [
      ["gift-ideas", "Geschenkideen"],
      ["gifts-for-women", "Geschenke für Frauen"],
      ["gifts-for-men", "Geschenke für Männer"],
      ["gifts-for-kids", "Geschenke für Kinder"],
      ["birthday-gifts", "Geburtstagsgeschenke"],
      ["wedding-gifts", "Hochzeitsgeschenke"],
      ["personalized-gifts", "Personalisierte Geschenke"],
      ["experience-gifts", "Erlebnisgeschenke"],
      ["gift-sets", "Geschenksets"],
      ["greeting-cards", "Grußkarten"],
    ],
  },


  /*
   * =======================================================
   * FESTE & SAISON
   * =======================================================
   */

  {
    id: "seasonal",
    name: "Feste & Saison",
    secondary: true,

    subcategories: [
      ["christmas", "Weihnachten"],
      ["easter", "Ostern"],
      ["halloween", "Halloween"],
      ["new-years-eve", "Silvester"],
      ["birthday", "Geburtstag"],
      ["wedding", "Hochzeit"],
      ["baptism", "Taufe"],
      ["school-enrollment", "Einschulung"],
      ["carnival", "Karneval & Fasching"],
      ["party-decoration", "Partydekoration"],
      ["gift-wrapping", "Geschenkverpackungen"],
      ["seasonal-decoration", "Saisonale Dekoration"],
    ],
  },


  /*
   * =======================================================
   * GEWERBE & INDUSTRIE
   * =======================================================
   */

  {
    id: "business-industry",
    name: "Gewerbe & Industrie",

    subcategories: [
      ["business-equipment", "Betriebsausstattung"],
      ["workshop-equipment", "Werkstattausstattung"],
      ["warehouse-logistics", "Lager & Logistik"],
      ["transport-equipment", "Transportgeräte"],
      ["commercial-packaging", "Verpackung & Versand"],
      ["catering-equipment", "Gastronomiebedarf"],
      ["hotel-supplies", "Hotelbedarf"],
      ["commercial-cleaning", "Reinigungsbedarf"],
      ["office-equipment", "Büroausstattung"],
      ["industrial-supplies", "Industriebedarf"],
      ["industrial-machines", "Maschinen"],
      ["industrial-tools", "Werkzeuge"],
      ["industrial-measuring", "Messtechnik"],
      ["industrial-safety", "Arbeitsschutz"],
      ["safety-equipment", "Sicherheitsausrüstung"],
      ["industrial-electrical", "Elektrobedarf"],
      ["medical-practice-supplies", "Praxisbedarf"],
      ["shop-fitting", "Ladenbau"],
    ],
  },


  /*
   * =======================================================
   * SOLAR / ENERGIE / E-MOBILITÄT
   * =======================================================
   */

  {
    id: "energy-emobility",
    name: "Solar, Energie & Elektromobilität",

    subcategories: [
      ["solar-panels", "Solarmodule"],
      ["balcony-power-plants", "Balkonkraftwerke"],
      ["inverters", "Wechselrichter"],
      ["energy-storage", "Stromspeicher"],
      ["solar-batteries", "Solarbatterien"],
      ["solar-accessories", "Solarzubehör"],
      ["energy-meters", "Energiemessgeräte"],
      ["wallboxes", "Wallboxen"],
      ["ev-charging-cables", "E-Auto-Ladekabel"],
      ["electric-car-accessories", "E-Auto-Zubehör"],
      ["power-stations", "Powerstations"],
      ["generators", "Generatoren"],
      ["energy-supply", "Energieversorgung"],
    ],
  },


  /*
   * =======================================================
   * LANDWIRTSCHAFT & HOF
   * =======================================================
   */

  {
    id: "agriculture",
    name: "Landwirtschaft & Hof",

    subcategories: [
      ["agricultural-supplies", "Landwirtschaftsbedarf"],
      ["stable-supplies", "Stallbedarf"],
      ["pasture-supplies", "Weidebedarf"],
      ["livestock-keeping", "Tierhaltung"],
      ["livestock-feed", "Futter"],
      ["agricultural-equipment", "Landwirtschaftliche Geräte"],
      ["forestry-supplies", "Forstbedarf"],
      ["farm-supplies", "Hofbedarf"],
      ["beekeeping", "Imkereibedarf"],
      ["poultry-keeping", "Geflügelhaltung"],
    ],
  },


  /*
   * =======================================================
   * SONSTIGES
   * =======================================================
   */

  {
    id: "other",
    name: "Sonstiges",

    subcategories: [
      ["other-products", "Weitere Produkte"],
    ],
  },
];


/*
 * =========================================================
 * HILFSFUNKTIONEN
 * =========================================================
 */


/*
 * Nur primäre Kategorien.
 *
 * Geschenke und Saison werden nicht als primäre
 * Produktklassifikation verwendet.
 */

export function getPrimaryMarktblattCategories() {
  return MARKTBLATT_TAXONOMY.filter(
    (category) =>
      category.secondary !== true
  );
}


/*
 * Kategorie anhand ihrer technischen ID finden.
 */

export function findMarktblattCategory(
  categoryId
) {
  return MARKTBLATT_TAXONOMY.find(
    (category) =>
      category.id === categoryId
  ) || null;
}


/*
 * Unterkategorie finden.
 */

export function findMarktblattSubcategory(
  categoryId,
  subcategoryId
) {
  const category =
    findMarktblattCategory(
      categoryId
    );

  if (!category) {
    return null;
  }

  const subcategory =
    category.subcategories.find(
      ([id]) =>
        id === subcategoryId
    );

  if (!subcategory) {
    return null;
  }

  return {
    id:
      subcategory[0],

    name:
      subcategory[1],

    categoryId:
      category.id,

    categoryName:
      category.name,
  };
}


/*
 * =========================================================
 * TAGS ERZEUGEN
 * =========================================================
 */

export function buildMarktblattCategoryTags(
  categoryId,
  subcategoryId
) {
  const category =
    findMarktblattCategory(
      categoryId
    );

  const subcategory =
    findMarktblattSubcategory(
      categoryId,
      subcategoryId
    );

  if (
    !category ||
    !subcategory
  ) {
    return [];
  }

  return [
    `mb:category:${category.id}`,
    `mb:subcategory:${subcategory.id}`,
  ];
}


/*
 * =========================================================
 * KI-LISTE ERZEUGEN
 * =========================================================
 *
 * Die KI bekommt ausschließlich diese erlaubten
 * Kategorien und Unterkategorien.
 */

export function getMarktblattTaxonomyForAi() {
  return getPrimaryMarktblattCategories()
    .map(
      (category) => ({
        id:
          category.id,

        name:
          category.name,

        subcategories:
          category.subcategories.map(
            ([id, name]) => ({
              id,
              name,
            })
          ),
      })
    );
}