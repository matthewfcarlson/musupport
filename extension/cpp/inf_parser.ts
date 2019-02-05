export interface InfData {
    sources: string[];
    packages:string[];
    pcds: string[];
    guids: string[]; // protocols and guids

}
export class InfPaser {
    public static ParseInf(path:string):InfData{
        return null;
    }
}