"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NG_STATE_NAMES = exports.NG_STATE_LIST = void 0;
exports.resolveNgState = resolveNgState;
exports.requireNgStateCode = requireNgStateCode;
const NG_STATES = [
    { name: 'Abia', code: 'AB' },
    { name: 'Adamawa', code: 'AD' },
    { name: 'Akwa Ibom', code: 'AK' },
    { name: 'Anambra', code: 'AN' },
    { name: 'Bauchi', code: 'BA' },
    { name: 'Bayelsa', code: 'BY' },
    { name: 'Benue', code: 'BE' },
    { name: 'Borno', code: 'BO' },
    { name: 'Cross River', code: 'CR' },
    { name: 'Delta', code: 'DE' },
    { name: 'Ebonyi', code: 'EB' },
    { name: 'Edo', code: 'ED' },
    { name: 'Ekiti', code: 'EK' },
    { name: 'Enugu', code: 'EN' },
    { name: 'Federal Capital Territory', code: 'FC' },
    { name: 'Gombe', code: 'GO' },
    { name: 'Imo', code: 'IM' },
    { name: 'Jigawa', code: 'JI' },
    { name: 'Kaduna', code: 'KD' },
    { name: 'Kano', code: 'KN' },
    { name: 'Katsina', code: 'KT' },
    { name: 'Kebbi', code: 'KE' },
    { name: 'Kogi', code: 'KO' },
    { name: 'Kwara', code: 'KW' },
    { name: 'Lagos', code: 'LA' },
    { name: 'Nasarawa', code: 'NA' },
    { name: 'Niger', code: 'NI' },
    { name: 'Ogun', code: 'OG' },
    { name: 'Ondo', code: 'ON' },
    { name: 'Osun', code: 'OS' },
    { name: 'Oyo', code: 'OY' },
    { name: 'Plateau', code: 'PL' },
    { name: 'Rivers', code: 'RI' },
    { name: 'Sokoto', code: 'SO' },
    { name: 'Taraba', code: 'TA' },
    { name: 'Yobe', code: 'YO' },
    { name: 'Zamfara', code: 'ZA' },
];
const NG_STATE_ALIASES = {
    fct: 'Federal Capital Territory',
    abuja: 'Federal Capital Territory',
    'akwa-ibom': 'Akwa Ibom',
    akwaibom: 'Akwa Ibom',
    'cross-river': 'Cross River',
    crossriver: 'Cross River',
    'nassarawa': 'Nasarawa',
    'rivers state': 'Rivers',
    'lagos state': 'Lagos',
};
function normalise(name) {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
const BY_NAME = new Map();
for (const s of NG_STATES)
    BY_NAME.set(normalise(s.name), s);
exports.NG_STATE_LIST = [...NG_STATES].sort((a, b) => a.name.localeCompare(b.name));
exports.NG_STATE_NAMES = exports.NG_STATE_LIST.map((s) => s.name);
function resolveNgState(input) {
    if (!input)
        return null;
    const key = normalise(input);
    const aliased = NG_STATE_ALIASES[key] ?? null;
    const lookup = aliased ? normalise(aliased) : key;
    return BY_NAME.get(lookup) ?? null;
}
function requireNgStateCode(input) {
    const resolved = resolveNgState(input);
    if (!resolved) {
        throw new Error(`Unknown Nigerian state "${input ?? ''}". ` +
            `Expected one of: ${exports.NG_STATE_NAMES.join(', ')}.`);
    }
    return resolved.code;
}
//# sourceMappingURL=ng-state-codes.js.map