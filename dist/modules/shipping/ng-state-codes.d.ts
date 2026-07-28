export declare const NG_STATE_LIST: ReadonlyArray<{
    name: string;
    code: string;
}>;
export declare const NG_STATE_NAMES: ReadonlyArray<string>;
export declare function resolveNgState(input: string | undefined | null): {
    name: string;
    code: string;
} | null;
export declare function requireNgStateCode(input: string | undefined | null): string;
