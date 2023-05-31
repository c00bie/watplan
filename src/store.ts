import { defineStore } from "pinia";
import { startOfMonth } from "date-fns";
import { uniqBy, merge, unionBy } from "lodash";

export enum ViewMode {
    Day = 'day',
    Week = 'week',
    Month = 'month'
}

export interface Entry {
    title?: string;
    type?: string;
    room?: string[];
    date?: string;
    timeStart?: string;
    timeEnd?: string;
    num?: number;
}

export interface Subject {
    title?: string;
    short?: string;
    color?: string;
    type?: string;
    prof?: string;
    numH?: number;
}

export interface Semester {
    id: string;
    name: string;
    start: string;
    end: string;
}

export interface Period {
    start: string;
    end: string;
}

export interface Note {
    title: string;
    type: string;
    num: number;
    content: string;
    updated: number;
}

export interface State {
    group: string;
    date: Date;
    entries: {
        [key: string]: Entry[];
    };
    subjects: {
        [key: string]: Subject[];
    };
    semesters: Semester[];
    periods: Period[];
    now: Date;
    mode: ViewMode;
    month: Date;
    search: string;
    searchType: string;
    year: string;
    canSync: boolean;
    settings: {
        hideWeekends: boolean;
        forceWeekView: boolean;
        useMarkers: boolean;
        useCustomColors: boolean;
        defaultView: ViewMode;
        markers: {
            [key: string]: string;
        },
        customColors: {
            [key: string]: string;
        },
        id?: string;
    };
    notes: Note[];
    groupNotes: {
        [key: string]: Note[];
    };
}

export default defineStore('store', {
    state: (): State => ({
        group: 'WCY22IY1S1',
        date: new Date(),
        entries: {},
        subjects: {},
        periods: [
            { start: '08:00', end: '09:35' },
            { start: '09:50', end: '11:25' },
            { start: '11:40', end: '13:15' },
            { start: '13:30', end: '15:05' },
            { start: '15:45', end: '17:20' },
            { start: '17:35', end: '19:10' },
            { start: '19:25', end: '21:00' },
        ],
        now: new Date(),
        mode: ViewMode.Day,
        month: startOfMonth(new Date()),
        search: '',
        searchType: '',
        year: "2022",
        semesters: [],
        canSync: false,
        settings: {
            hideWeekends: false,
            forceWeekView: false,
            useMarkers: false,
            useCustomColors: false,
            defaultView: ViewMode.Week,
            markers: {},
            customColors: {}
        },
        notes: [],
        groupNotes: {}
    }),
    getters: {
        groups: (state) => {
            return Object.keys(state.entries);
        },
        gEntries: (state) => {
            return state.entries[state.group] ?? [];
        },
        gSubjects: (state) => {
            return state.subjects[state.group];
        },
        subTypes: (state): string[] => {
            return Array.from(new Set(state.subjects[state.group].map((sub) => sub.type ?? '')));
        },
        dateSemester: (state) => {
            return state.semesters.find((semester) => {
                const start = new Date(semester.start);
                const end = new Date(semester.end);
                return state.date >= start && state.date <= end;
            });
        },
        yearSemesters: (state) => {
            return state.semesters.filter((semester) => semester.id.startsWith(state.year));
        },
        years: (state) => {
            return Array.from(new Set(state.semesters.map((semester) => semester.id.slice(0, 4))));
        },
        monthMode: (state) => {
            return state.mode === ViewMode.Month;
        }
    },
    actions: {
        getNotes(entry: Entry | undefined) {
            if (entry === undefined)
                return [];
            var notes = this.notes.filter((note) => note.title === entry.title && note.type === entry.type && note.num === entry.num);
            if (this.groupNotes[this.group] !== undefined) {
                notes = notes.concat(this.groupNotes[this.group].filter((note) => note.title === entry.title && note.type === entry.type && note.num === entry.num));
            }
            notes.sort((a, b) => b.updated - a.updated);
            return notes;
        },
        loadState() {
            if (localStorage.getItem('settings') === null)
                return;
            this.year = localStorage.getItem('year') ?? '2022';
            this.group = localStorage.getItem('group') ?? 'WCY22IY1S1';
            this.settings = merge(this.settings, JSON.parse(localStorage.getItem('settings') ?? '{}'));
            this.notes = JSON.parse(localStorage.getItem('notes') ?? '[]');
        },
        saveState() {
            localStorage.setItem('year', this.year);
            localStorage.setItem('group', this.group);
            localStorage.setItem('settings', JSON.stringify(this.settings));
            localStorage.setItem('notes', JSON.stringify(this.notes));
            this.pushSettings();
        },
        async pullSettings() {
            fetch(`${(import.meta.env.API_URL ?? 'https://api.watplan.coobie.dev')}/${this.settings.id}`).then((res) => res.json()).then((res) => {
                if (res.success) {
                    this.canSync = true;
                    this.settings = merge(this.settings, res.data.settings ?? {});
                    this.notes = unionBy(this.notes, res.data.notes ?? [], x => x.title + x.type + x.num);
                }
                else
                    this.canSync = false;
            }).catch((err) => {
                this.canSync = false;
                console.error(err);
            });
        },
        async pushSettings() {
            fetch(`${(import.meta.env.API_URL ?? 'https://api.watplan.coobie.dev')}/${this.settings.id}`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    settings: this.settings,
                    notes: this.notes
                })
            }).then((res) => res.json()).then((res) => {
                if (res.success) {
                    this.canSync = true;
                }
                else
                    this.canSync = false;
            }).catch((err) => {
                this.canSync = false;
                console.error(err);
            });
        },
        async refresh() {
            for (let i = 0; i <= 1; i++) {
                const get = i === 1 ? getFetch : getCache;
                try {
                    var ent: State['entries'] = {};
                    var sub: State['subjects'] = {};
                    this.semesters = await get('/data/semesters.json').then((res) => (res?.json() ?? []));
                    for (const semester of this.yearSemesters) {
                        var entries: typeof ent = await get(`/data/entries-${semester.id}.json`).then((res) => (res?.json() ?? {}));
                        for (const group in entries) {
                            if (ent[group] === undefined) ent[group] = [];
                            ent[group].push(...entries[group]);
                            ent[group] = uniqBy(ent[group], x => (x.title! + x.type! + x.room! + x.date! + x.timeStart! + x.timeEnd! + x.num!));
                        }
                        var subjects: typeof sub = await get(`/data/subjects-${semester.id}.json`).then((res) => (res?.json() ?? {}));
                        for (const group in subjects) {
                            if (sub[group] === undefined) sub[group] = [];
                            sub[group].push(...subjects[group]);
                            sub[group] = uniqBy(sub[group], x => (x.title! + x.short! + x.color! + x.type! + x.prof! + x.numH!));
                        }
                    }
                    this.entries = ent;
                    this.subjects = sub;
                }
                catch (err) {
                    console.error(err);
                }
            }
        },
        subColor(sub: Subject) {
            if (this.settings.useCustomColors)
                return this.settings.customColors[sub.title!];
            return undefined;
        },
        generateID() {
            this.settings.id = ''
            var sum = 0
            for (var i = 0; i < 11; i++) {
                var n = Math.random().toString(36).substring(2, 3)
                if (Math.random() > 0.5) n = n.toUpperCase()
                this.settings.id += n
                sum += parseInt(n, 36)
            }
            this.settings.id += (sum % 36).toString(36)
        },
        checkID(id: string) {
            if (id.match(/^[a-z0-9]{12}$/i) === null) return false
            var sum = 0
            for (var i = 0; i < 11; i++) {
                sum += parseInt(id[i], 36)
            }
            return id[11] == (sum % 36).toString(36)
        }
    }
});

function getFetch(url: string) {
    return fetch(url, { cache: 'no-cache' });
}

function getCache(url: string) {
    return caches.match(url);
}