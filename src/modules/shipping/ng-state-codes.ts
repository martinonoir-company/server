/**
 * Nigerian state-name → ISO 3166-2:NG subdivision code mapping.
 *
 * AAJ Express requires `addressDetails.stateOrProvinceCode` on every
 * address (2-character code, e.g. `LA` for Lagos). The storefront /
 * mobile checkout forms collect the state by NAME (which is how
 * customers think). We resolve the code from the name here so the
 * mapping lives in one place and stays consistent everywhere
 * (checkout, AAJ quote, AAJ booking, tracking).
 *
 * Source: ISO 3166-2:NG — the official Nigerian state subdivision
 * codes used by every major carrier (AAJ, DHL, UPS, FedEx). 36 states
 * + FCT = 37 entries. Lookup is case-insensitive on the state name and
 * tolerates the most common variants ("FCT" vs "Federal Capital
 * Territory" vs "Abuja", "Akwa-Ibom" vs "Akwa Ibom", etc.).
 */

/** Canonical (name, code) pairs. */
const NG_STATES: ReadonlyArray<{ name: string; code: string }> = [
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

/** Common alternative spellings → canonical name. */
const NG_STATE_ALIASES: Record<string, string> = {
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

/** Normalise an input string to a lookup key: lowercase, collapse spaces. */
function normalise(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Lookup table built once at module load. */
const BY_NAME = new Map<string, { name: string; code: string }>();
for (const s of NG_STATES) BY_NAME.set(normalise(s.name), s);

/** Public list of (name, code) pairs, sorted alphabetically. */
export const NG_STATE_LIST: ReadonlyArray<{ name: string; code: string }> =
  [...NG_STATES].sort((a, b) => a.name.localeCompare(b.name));

/** Public list of just the canonical names — handy for UI dropdowns. */
export const NG_STATE_NAMES: ReadonlyArray<string> = NG_STATE_LIST.map(
  (s) => s.name,
);

/**
 * Resolve a state name to its (canonicalName, code) pair. Returns null
 * when the input doesn't match any known state. The carrier-bound code
 * is the second element; UIs that need a normalised display name should
 * prefer the first.
 */
export function resolveNgState(
  input: string | undefined | null,
): { name: string; code: string } | null {
  if (!input) return null;
  const key = normalise(input);
  const aliased = NG_STATE_ALIASES[key] ?? null;
  const lookup = aliased ? normalise(aliased) : key;
  return BY_NAME.get(lookup) ?? null;
}

/**
 * Convenience helper that throws when the input is missing or unknown.
 * Use this at the AAJ-call layer, where a missing code is a 400 we'd
 * rather catch ourselves with a clearer message than relay AAJ's
 * generic validation error.
 */
export function requireNgStateCode(input: string | undefined | null): string {
  const resolved = resolveNgState(input);
  if (!resolved) {
    throw new Error(
      `Unknown Nigerian state "${input ?? ''}". ` +
        `Expected one of: ${NG_STATE_NAMES.join(', ')}.`,
    );
  }
  return resolved.code;
}
