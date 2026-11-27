/// <reference path="../pb_data/types.d.ts" />

// Hilfetexte pro Übung: Gerät, Alternativen, Ausführung, typische Fehler,
// Schulter-Hinweis (zweimal am Labrum operiert). Allgemeines Trainingswissen,
// noch nicht fachlich geprüft – wird nach den ersten Trainings angepasst.

const HELP = {
  warm: {
    geraet: "Crosstrainer, Fahrrad-Ergometer oder Laufband – was gerade frei ist.",
    alternativen: ["Rudergerät mit wenig Widerstand", "Zügiges Gehen auf dem Laufband mit leichter Steigung"],
    ausfuehrung: [
      "Mit niedrigem Widerstand bzw. langsamem Tempo beginnen.",
      "Alle 2–3 Minuten etwas steigern, bis du warm bist und leicht schwitzt.",
      "Am Ende solltest du noch locker reden können."
    ],
    fehler: ["Zu schnell zu hart einsteigen", "Aufwärmen abkürzen, weil die Zeit knapp ist"],
    schulter: "Am Crosstrainer die Griffe locker führen, nicht mit den Armen ziehen oder drücken. Bei Unsicherheit lieber Rad oder Laufband."
  },
  ar: {
    geraet: "Kabelzug mit Einhandgriff, Rolle auf Ellbogenhöhe.",
    alternativen: ["Mit leichtem Widerstandsband an einer Stange", "Seitlich liegend mit sehr leichter Kurzhantel"],
    ausfuehrung: [
      "Seitlich zum Kabelzug stellen, der arbeitende Arm ist der vom Gerät entfernte.",
      "Ellbogen 90° gebeugt und seitlich am Körper; ein kleines gerolltes Handtuch zwischen Ellbogen und Rumpf hilft.",
      "Unterarm langsam nach außen drehen, so weit es ohne Ausweichen geht.",
      "Kontrolliert zurück, 15 Wiederholungen je Seite."
    ],
    fehler: ["Ellbogen wandert vom Körper weg", "Oberkörper dreht mit", "Zu viel Gewicht – es geht um Ansteuerung, nicht um Kraft"],
    schulter: "Nur im schmerzfreien Bereich drehen, nicht bis ans Bewegungsende drücken. Sehr leichtes Gewicht."
  },
  pa: {
    geraet: "Kabelzug mit zwei Rollen (Kabelturm), beide auf Brusthöhe, Einhandgriffe ohne Zusatzgewicht oder mit dem leichtesten Block.",
    alternativen: ["Widerstandsband mit beiden Händen vor der Brust auseinanderziehen"],
    ausfuehrung: [
      "Mittig zwischen die Rollen stellen, linker Griff in die rechte Hand und umgekehrt (Kabel gekreuzt).",
      "Arme fast gestreckt auf Brusthöhe vor dem Körper.",
      "Arme seitlich auseinanderführen, dabei die Schulterblätter zusammenziehen.",
      "Kurz halten, langsam zurück."
    ],
    fehler: ["Schultern ziehen Richtung Ohren", "Hohlkreuz statt Schulterblatt-Arbeit", "Ellbogen stark beugen"],
    schulter: "Arme nur bis auf Höhe der Körperlinie öffnen, nicht dahinter. Leicht bleiben."
  },
  fp: {
    geraet: "Kabelzug mit Seilgriff, Rolle etwa auf Stirnhöhe.",
    alternativen: ["Widerstandsband auf Stirnhöhe befestigt"],
    ausfuehrung: [
      "Seil mit beiden Händen greifen, Daumen zeigen zu dir. Einen Schritt zurück, bis Spannung da ist.",
      "Seil Richtung Stirn ziehen, die Enden dabei auseinander.",
      "Ellbogen bleiben auf Schulterhöhe oder knapp darunter.",
      "Schulterblätter zusammen, kurz halten, langsam zurück."
    ],
    fehler: ["Mit dem Oberkörper nach hinten lehnen", "Ellbogen weit über Schulterhöhe", "Zu schwer – die Bewegung wird ruckartig"],
    schulter: "Ellbogen nicht über Schulterhöhe heben und keine starke Außenrotation am Ende erzwingen. Bei Ziehen im Gelenk: Rolle etwas tiefer stellen."
  },
  bp: {
    geraet: "Beinpresse (Maschine mit Fußplatte, sitzend oder liegend).",
    alternativen: ["Beinstrecker plus Beinbeuger an der Maschine", "Goblet-Squat mit leichter Kurzhantel vor der Brust"],
    ausfuehrung: [
      "Rücken und Becken ganz an die Lehne, Füße hüftbreit mittig auf die Platte.",
      "Sicherung lösen, Knie langsam beugen, bis etwa 90° im Knie erreicht sind.",
      "Über die ganze Fußsohle zurückdrücken, Knie zeigen in Richtung der Zehen.",
      "Oben nicht ganz durchstrecken, Spannung halten."
    ],
    fehler: ["Becken hebt sich unten von der Lehne ab", "Knie fallen nach innen", "Knie oben durchgedrückt"],
    schulter: "Griffe nur locker halten, nicht mit den Armen mitdrücken."
  },
  lz: {
    geraet: "Latzug-Maschine mit engem, neutralem Griff (Handflächen zeigen zueinander, V-Griff oder Parallelgriff).",
    alternativen: ["Latzug am Kabelturm mit V-Griff", "Unterstütztes Klimmzug-Gerät (Assisted Pull-up) mit neutralem Griff"],
    ausfuehrung: [
      "Oberschenkel unter das Polster klemmen, aufrecht sitzen, leicht zurückgelehnt.",
      "Zuerst die Schultern nach unten ziehen, dann den Griff zur oberen Brust ziehen.",
      "Ellbogen zeigen nach unten, nahe am Körper.",
      "Langsam zurück, oben die Arme fast strecken, ohne die Schultern hochziehen zu lassen."
    ],
    fehler: ["Mit Schwung aus dem Oberkörper ziehen", "Schultern kommen am Ende nach vorne", "Zu weit nach hinten lehnen"],
    schulter: "Immer vor dem Kopf ziehen, nie in den Nacken. Oben nicht ganz aushängen, damit die Schulter stabil bleibt."
  },
  br: {
    geraet: "Brustpresse-Maschine mit neutralem Griff (Handflächen zueinander).",
    alternativen: ["Brustpresse am Kabelturm", "Liegestütz erhöht an einer Bank, enge Hände"],
    ausfuehrung: [
      "Sitz so einstellen, dass die Griffe etwa auf mittlerer Brusthöhe sind.",
      "Schulterblätter leicht zurück und nach unten, Rücken an der Lehne.",
      "Griffe nach vorne drücken, ohne die Ellbogen ganz durchzustrecken.",
      "Langsam zurück, bis die Hände etwa auf Höhe der Körperlinie sind."
    ],
    fehler: ["Griffe kommen hinter die Körperlinie", "Ellbogen weit seitlich auf Schulterhöhe", "Schultern lösen sich von der Lehne"],
    schulter: "Ellbogen etwa 45° vom Körper, Griffe nicht hinter die Körperlinie. Keine tiefe Dehnung in der Endposition."
  },
  ru: {
    geraet: "Kabelrudern sitzend (Low Row) mit neutralem V-Griff, oder Rudermaschine mit Brustpolster.",
    alternativen: ["Rudermaschine mit Brustpolster", "Einarmiges Kurzhantelrudern auf der Bank"],
    ausfuehrung: [
      "Aufrecht sitzen, Knie leicht gebeugt, Brust raus.",
      "Zuerst die Schulterblätter zurückziehen, dann den Griff Richtung Bauchnabel ziehen.",
      "Ellbogen nahe am Körper, kurz halten.",
      "Langsam zurück, ohne dass der Oberkörper nach vorne kippt."
    ],
    fehler: ["Schwung aus dem unteren Rücken", "Schultern ziehen hoch", "Ellbogen weit hinter den Körper reißen"],
    schulter: "Ellbogen nur bis knapp hinter die Körperlinie ziehen. Vorne die Schultern nicht nach vorne fallen lassen."
  },
  bi: {
    geraet: "Kabelzug mit gerader Stange oder Seil, Rolle ganz unten.",
    alternativen: ["Bizeps-Maschine", "Kurzhantel-Curls im Stehen"],
    ausfuehrung: [
      "Aufrecht stehen, Ellbogen am Körper.",
      "Unterarme hochbeugen, die Oberarme bleiben ruhig.",
      "Oben kurz anspannen, langsam ablassen."
    ],
    fehler: ["Ellbogen wandern nach vorne", "Mit dem Rücken Schwung holen", "Unten ganz aushängen"],
    schulter: "Ellbogen bleiben am Körper, Schultern nicht nach vorne ziehen."
  },
  tr: {
    geraet: "Kabelzug mit Seil oder Stange, Rolle ganz oben.",
    alternativen: ["Trizeps-Maschine (Dip-Maschine nicht verwenden)", "Einarmiger Pushdown mit Einhandgriff"],
    ausfuehrung: [
      "Vor dem Kabel stehen, leicht nach vorne gebeugt, Ellbogen am Körper.",
      "Unterarme nach unten strecken, bis die Arme fast gerade sind.",
      "Langsam zurück bis etwa 90° im Ellbogen."
    ],
    fehler: ["Ellbogen gehen nach vorne oben", "Mit dem Körpergewicht drücken", "Zu weit nach oben zurückkommen"],
    schulter: "Keine Dips und kein Überkopf-Trizepsdrücken. Oberarme bleiben ruhig am Körper."
  },
  hy: {
    geraet: "Hyperextension-Bank (Rückenstrecker-Bank, oft 45° schräg): Polster für die Hüfte, Fußrollen zum Einhaken.",
    alternativen: ["Rückenstrecker-Maschine (sitzend)", "Bird-Dog am Boden (Vierfüßlerstand, Arm und Bein diagonal strecken)"],
    ausfuehrung: [
      "Polster so einstellen, dass die Hüftknochen knapp darüber liegen und du dich frei in der Hüfte beugen kannst.",
      "Fersen unter die Rollen, Arme vor der Brust verschränken.",
      "Mit geradem Rücken langsam nach vorne unten beugen, bis du eine Dehnung hinten in den Oberschenkeln spürst.",
      "Mit Po und unterem Rücken hochkommen, bis der Körper eine gerade Linie bildet. Kurz halten."
    ],
    fehler: ["Oben ins Hohlkreuz überstrecken", "Schwung holen", "Polster zu hoch – Bewegung kommt dann nur aus dem Rücken"],
    schulter: "Arme vor der Brust verschränken, nicht hinter den Kopf legen."
  },
  z2: {
    geraet: "Fahrrad-Ergometer, Crosstrainer oder Laufband mit Steigung.",
    alternativen: ["Rudergerät, wenn die Schulter es zulässt", "Zügiges Gehen draußen"],
    ausfuehrung: [
      "Tempo so wählen, dass du gerade noch in ganzen Sätzen reden kannst.",
      "Puls grob 60–70 % der maximalen Herzfrequenz (Faustregel).",
      "Gleichmäßig bleiben, nicht zwischendurch sprinten.",
      "Nach der Hälfte darf das Gerät gewechselt werden."
    ],
    fehler: ["Zu schnell – dann ist es keine Zone 2 mehr", "Am Laufband an den Griffen festhalten"],
    schulter: "Am Crosstrainer und Rudergerät nicht mit den Armen ziehen. Bei Beschwerden Rad oder Laufband."
  }
};

migrate((app) => {
  const c = app.findCollectionByNameOrId("exercises");
  c.fields.add(new JSONField({ name: "help", maxSize: 20000 }));
  app.save(c);
  for (const [key, help] of Object.entries(HELP)) {
    let r;
    try { r = app.findFirstRecordByData("exercises", "key", key); } catch (_) { continue; }
    r.set("help", help);
    app.save(r);
  }
}, (app) => {
  const c = app.findCollectionByNameOrId("exercises");
  c.fields.removeByName("help");
  app.save(c);
});
