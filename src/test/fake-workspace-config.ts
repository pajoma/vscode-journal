import { IWorkspaceConfigReader } from '../model';

export class FakeWorkspaceConfig implements IWorkspaceConfigReader {
    constructor(private readonly settings: Record<string, unknown> = {}) {}

    get<T>(section: string, defaultValue?: T): T | undefined {
        return (section in this.settings
            ? this.settings[section]
            : defaultValue) as T | undefined;
    }
}
