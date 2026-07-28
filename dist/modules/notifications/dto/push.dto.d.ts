export declare class RegisterPushTokenDto {
    expoPushToken: string;
    platform?: 'ios' | 'android';
    deviceLabel?: string;
}
export declare class UnregisterPushTokenDto {
    expoPushToken: string;
}
