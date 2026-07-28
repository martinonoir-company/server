export declare class BranchAddressDto {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    countryCode?: string;
    postalCode?: string;
}
export declare class CreateBranchDto {
    code: string;
    name: string;
    warehouseCode: string;
    address?: BranchAddressDto;
    phone?: string;
}
export declare class UpdateBranchDto {
    name?: string;
    address?: BranchAddressDto;
    phone?: string;
    isActive?: boolean;
}
