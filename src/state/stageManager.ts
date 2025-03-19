export enum Stage {
    IDLE = 0,
    COMPLETION_INSERTED = 1,
    ALTERNATIVES_DISPLAYED = 2
}

export class StageManager {
    private static instance: StageManager;
    private currentStage: Stage = Stage.IDLE;
    
    private constructor() {}
    
    public static getInstance(): StageManager {
        if (!StageManager.instance) {
            StageManager.instance = new StageManager();
        }
        return StageManager.instance;
    }
    
    public setStage(stage: Stage): void {
        this.currentStage = stage;
    }
    
    public getStage(): Stage {
        return this.currentStage;
    }
    
    public canExecuteInCurrentStage(allowedStages: Stage[]): boolean {
        return allowedStages.includes(this.currentStage);
    }
}
