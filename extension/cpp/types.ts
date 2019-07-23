
export interface InfData {
  defines: Map<string, string>;
  sources: string[];
  packages: string[];
  pcds: string[];
  guids: string[]; // protocols and guids
  infPath: string;

}
export interface DecData {
  includes: string[];
  decPath: string;
}