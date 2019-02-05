export interface InfData {
    sources: string[];
    packages:string[];
    pcds: string[];
    guids: string[]; // protocols and guids

}
export class InfPaser {
    public static async ParseInf(path:string):Promise<InfData>{
        return null;
    }
}