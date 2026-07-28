import { PushService } from './push.service';
import { RegisterPushTokenDto, UnregisterPushTokenDto } from './dto/push.dto';
import { User } from '../users/entities/user.entity';
export declare class PushController {
    private readonly pushService;
    constructor(pushService: PushService);
    register(dto: RegisterPushTokenDto, user: User): Promise<{
        data: {
            id: string;
            platform: "ios" | "android" | undefined;
            deviceLabel: string | undefined;
            isActive: boolean;
            createdAt: Date;
        };
    }>;
    unregister(dto: UnregisterPushTokenDto, user: User): Promise<{
        data: {
            unregistered: boolean;
        };
    }>;
}
