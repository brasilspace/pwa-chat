/**
 * prilog-de-locale — Deutsche UI-Strings fuer Univer.
 *
 * Univer hat von Haus aus kein DE-Locale-Bundle. Wir definieren hier
 * die wichtigsten Sichtbar-Strings (Ribbon-Tabs, Toolbar, Dialoge) und
 * mergen sie ueber das EN-US-Bundle. Untranslated-Keys fallen damit
 * automatisch auf Englisch zurueck — nichts geht kaputt, nur teilweise
 * englisch.
 *
 * Formelnamen (SUM, AVERAGE, IF, ...) bleiben absichtlich englisch —
 * Excel-Standard.
 *
 * Wenn du eine deutsche Beschriftung vermisst: einfach im richtigen
 * Bereich ergaenzen, der Wert ueberschreibt Englisch automatisch.
 */

export const prilogDeLocale = {
    spreadsheetLabel: 'Tabelle',
    spreadsheetRightLabel: 'mehr Tabellen',

    // Ribbon (Reiter oben)
    ribbon: {
        start: 'Start',
        startDesc: 'Tabelle initiieren und Grundeinstellungen vornehmen.',
        insert: 'Einfuegen',
        insertDesc: 'Zeilen, Spalten, Diagramme und weitere Elemente einfuegen.',
        formulas: 'Formeln',
        formulasDesc: 'Funktionen und Formeln fuer Berechnungen verwenden.',
        data: 'Daten',
        dataDesc: 'Daten verwalten — Import, Sortierung, Filter.',
        view: 'Ansicht',
        viewDesc: 'Ansichts-Modi wechseln und Darstellung anpassen.',
        others: 'Sonstige',
        othersDesc: 'Weitere Funktionen und Einstellungen.',
        more: 'Mehr',
    },

    // Top-Level UI
    toolbar: {
        heading: {
            normal: 'Normal',
            title: 'Titel',
            subTitle: 'Untertitel',
            1: 'Ueberschrift 1',
            2: 'Ueberschrift 2',
            3: 'Ueberschrift 3',
            4: 'Ueberschrift 4',
            5: 'Ueberschrift 5',
            6: 'Ueberschrift 6',
            tooltip: 'Ueberschrift festlegen',
        },

        // Sheet-Toolbar (eigentliche Tabellen-Aktionen)
        undo: 'Rueckgaengig',
        redo: 'Wiederherstellen',
        formatPainter: 'Format uebertragen',
        font: 'Schriftart',
        fontSize: 'Schriftgroesse',
        fontSizeIncrease: 'Schrift vergroessern',
        fontSizeDecrease: 'Schrift verkleinern',
        bold: 'Fett',
        italic: 'Kursiv',
        strikethrough: 'Durchgestrichen',
        subscript: 'Tiefgestellt',
        superscript: 'Hochgestellt',
        underline: 'Unterstrichen',
        textColor: { main: 'Textfarbe', right: 'Farbe waehlen' },
        resetColor: 'Zuruecksetzen',
        fillColor: { main: 'Fuellfarbe', right: 'Farbe waehlen' },
        border: { main: 'Rahmen', right: 'Rahmen-Stil' },
        mergeCell: { main: 'Zellen verbinden', right: 'Verbund-Typ' },
        horizontalAlignMode: { main: 'Horizontal ausrichten', right: 'Ausrichtung' },
        verticalAlignMode: { main: 'Vertikal ausrichten', right: 'Ausrichtung' },
        textWrapMode: { main: 'Zeilenumbruch', right: 'Umbruch-Modus' },
        textRotateMode: { main: 'Text drehen', right: 'Drehen-Modus' },
        more: 'Mehr',
        toggleGridlines: 'Gitternetzlinien umschalten',
        textToNumber: 'Text in Zahl',
    },

    align: {
        left: 'links',
        center: 'zentriert',
        right: 'rechts',
        top: 'oben',
        middle: 'mitte',
        bottom: 'unten',
    },

    button: {
        confirm: 'OK',
        cancel: 'Abbrechen',
        close: 'Schliessen',
        update: 'Aktualisieren',
        delete: 'Loeschen',
        insert: 'Einfuegen',
        prevPage: 'Zurueck',
        nextPage: 'Weiter',
        total: 'Gesamt:',
    },

    punctuation: {
        tab: 'Tabulator',
        semicolon: 'Semikolon',
        comma: 'Komma',
        space: 'Leerzeichen',
    },

    colorPicker: {
        collapse: 'Einklappen',
        customColor: 'BENUTZERDEFINIERT',
        change: 'Aendern',
        confirmColor: 'OK',
        cancelColor: 'Abbrechen',
    },

    borderLine: {
        borderTop: 'Rahmen oben',
        borderBottom: 'Rahmen unten',
        borderLeft: 'Rahmen links',
        borderRight: 'Rahmen rechts',
        borderNone: 'Kein Rahmen',
        borderAll: 'Alle Rahmen',
        borderOutside: 'Aussen-Rahmen',
        borderInside: 'Innen-Rahmen',
        borderHorizontal: 'Horizontal',
        borderVertical: 'Vertikal',
        borderColor: 'Rahmenfarbe',
        borderSize: 'Rahmenstaerke',
        borderType: 'Rahmen-Stil',
    },

    merge: {
        all: 'Alle verbinden',
        vertical: 'Vertikal verbinden',
        horizontal: 'Horizontal verbinden',
        cancel: 'Verbund aufheben',
        overlappingError: 'Ueberlappende Bereiche koennen nicht verbunden werden',
        partiallyError: 'Aktion auf teilverbundenen Zellen nicht moeglich',
        confirm: {
            title: 'Beim Verbinden bleibt nur der Wert der oberen-linken Zelle erhalten. Fortfahren?',
            cancel: 'Abbrechen',
            confirm: 'Verbinden',
            warning: 'Achtung',
            dismantleMergeCellWarning: 'Dadurch werden manche verbundenen Zellen aufgeloest. Fortfahren?',
        },
    },

    rangeSelector: {
        title: 'Datenbereich auswaehlen',
        addAnotherRange: 'Bereich hinzufuegen',
        buttonTooltip: 'Datenbereich waehlen',
        placeHolder: 'Bereich auswaehlen oder eingeben',
        confirm: 'Bestaetigen',
        cancel: 'Abbrechen',
    },

    'shortcut-panel': { title: 'Tastenkuerzel' },
    'common-edit': 'Allgemeine Bearbeitungs-Tastenkuerzel',
    'toggle-shortcut-panel': 'Tastenkuerzel-Panel umschalten',
    'global-shortcut': 'Globale Tastenkuerzel',
    'zoom-slider': { resetTo: 'Zuruecksetzen auf' },

    shortcut: {
        undo: 'Rueckgaengig',
        redo: 'Wiederherstellen',
        cut: 'Ausschneiden',
        copy: 'Kopieren',
        paste: 'Einfuegen',
        'shortcut-panel': 'Tastenkuerzel-Panel umschalten',
    },

    clipboard: {
        authentication: {
            title: 'Berechtigung verweigert',
            content: 'Bitte erlaube Prilog Tabellen den Zugriff auf die Zwischenablage.',
        },
    },

    textEditor: {
        formulaError: 'Bitte eine gueltige Formel eingeben, z.B. =SUM(A1)',
        rangeError: 'Bitte einen gueltigen Bereich eingeben, z.B. A1:B10',
    },
};
