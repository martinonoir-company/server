import { PosSessionsService } from './pos-sessions.service';
import { AddSessionItemDto, ConfirmSessionDto, OpenSessionDto, PaymentIntentDto, UpdateSessionItemDto, VoidSessionDto } from './dto/pos-session.dto';
import { User } from '../users/entities/user.entity';
export declare class PosSessionsController {
    private readonly service;
    constructor(service: PosSessionsService);
    open(terminalCode: string, dto: OpenSessionDto, user: User): Promise<{
        data: import("./entities/pos-session.entity").PosSession;
    }>;
    getCurrent(terminalCode: string, user: User): Promise<{
        data: import("./entities/pos-session.entity").PosSession;
    }>;
    addItem(terminalCode: string, dto: AddSessionItemDto, user: User): Promise<{
        data: import("./entities/pos-session.entity").PosSession;
    }>;
    updateItem(terminalCode: string, lineId: string, dto: UpdateSessionItemDto, user: User): Promise<{
        data: import("./entities/pos-session.entity").PosSession;
    }>;
    paymentIntent(terminalCode: string, dto: PaymentIntentDto, user: User): Promise<{
        data: import("./entities/pos-session.entity").PosSession;
    }>;
    confirm(terminalCode: string, dto: ConfirmSessionDto, user: User): Promise<{
        data: import("./entities/pos-session.entity").PosSession;
    }>;
    void(terminalCode: string, dto: VoidSessionDto, user: User): Promise<{
        data: import("./entities/pos-session.entity").PosSession;
    }>;
}
