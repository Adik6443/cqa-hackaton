// Builds an unmanaged Dataverse (Dynamics 365) solution with the CQA frontend as HTML web resources.
//   npm run pack:d365   ->  d365/FreedomCQA_1_0_0_0.zip
// Import: make.powerapps.com → Solutions → Import solution → this zip → Publish all customizations.
// No dependencies: a small ZIP writer (deflate from node:zlib) is below.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const VERSION = '1.0.0.0';
const PREFIX = 'fcqa';                  // publisher customization prefix
const FOLDER = `${PREFIX}_/cqa/`;       // web resource virtual folder: fcqa_/cqa/index.html, fcqa_/cqa/cqa.js ...
const SRC = 'dist-d365';
const OUT_DIR = 'd365';
const OUT = join(OUT_DIR, `FreedomCQA_${VERSION.replaceAll('.', '_')}.zip`);

// Dataverse web resource types
const TYPES = { '.html': 1, '.htm': 1, '.css': 2, '.js': 3, '.xml': 4, '.png': 5, '.jpg': 6, '.gif': 7, '.xsl': 9, '.ico': 10, '.svg': 11 };
const DISPLAY = {
  'index.html': 'Freedom CQA — приложение (открывать этот ресурс)',
  'cqa.js': 'Freedom CQA — код приложения',
  'cqa.css': 'Freedom CQA — стили',
  'config.js': 'Freedom CQA — настройки (адрес бэкенда)',
  'favicon.svg': 'Freedom CQA — иконка',
};

const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (TYPES[extname(f).toLowerCase()]) files.push(p);
  }
})(SRC);
if (!files.some((f) => f.endsWith('index.html'))) {
  console.error(`No ${SRC}/index.html. Run "npm run build:d365" first.`);
  process.exit(1);
}

// stable GUID per web resource name, so re-importing a new version updates the same resources
const guid = (name) => {
  const h = createHash('md5').update(`freedom-cqa:${name}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const resources = files.map((p) => {
  const rel = relative(SRC, p).replaceAll('\\', '/');
  const name = FOLDER + rel;
  return { name, rel, type: TYPES[extname(p).toLowerCase()], id: guid(name), data: readFileSync(p), display: DISPLAY[rel] ?? `Freedom CQA — ${rel}` };
});

const solutionXml = `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml version="9.2.24101.191" SolutionPackageVersion="9.2" languagecode="1049" generatedBy="CrmLive" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" OrganizationVersion="9.2.24101.191" OrganizationSchemaType="Standard" CRMServerServiceabilityVersion="9.2.24101.00191">
  <SolutionManifest>
    <UniqueName>FreedomCQA</UniqueName>
    <LocalizedNames>
      <LocalizedName description="Freedom CQA — контроль качества диалогов" languagecode="1049" />
    </LocalizedNames>
    <Descriptions>
      <Description description="Оценка чатов и звонков операторов по чек-листу с помощью AI, апелляции и пересмотр. Веб-ресурс fcqa_/cqa/index.html." languagecode="1049" />
    </Descriptions>
    <Version>${VERSION}</Version>
    <Managed>0</Managed>
    <Publisher>
      <UniqueName>quark</UniqueName>
      <LocalizedNames>
        <LocalizedName description="QUARK" languagecode="1049" />
      </LocalizedNames>
      <Descriptions />
      <EMailAddress xsi:nil="true"></EMailAddress>
      <SupportingWebsiteUrl xsi:nil="true"></SupportingWebsiteUrl>
      <CustomizationPrefix>${PREFIX}</CustomizationPrefix>
      <CustomizationOptionValuePrefix>72815</CustomizationOptionValuePrefix>
      <Addresses>
        <Address>
          <AddressNumber>1</AddressNumber>
          <AddressTypeCode>1</AddressTypeCode>
          <City xsi:nil="true"></City><County xsi:nil="true"></County><Country xsi:nil="true"></Country><Fax xsi:nil="true"></Fax>
          <FreightTermsCode xsi:nil="true"></FreightTermsCode><ImportSequenceNumber xsi:nil="true"></ImportSequenceNumber>
          <Latitude xsi:nil="true"></Latitude><Line1 xsi:nil="true"></Line1><Line2 xsi:nil="true"></Line2><Line3 xsi:nil="true"></Line3>
          <Longitude xsi:nil="true"></Longitude><Name xsi:nil="true"></Name><PostalCode xsi:nil="true"></PostalCode><PostOfficeBox xsi:nil="true"></PostOfficeBox>
          <PrimaryContactName xsi:nil="true"></PrimaryContactName><ShippingMethodCode>1</ShippingMethodCode><StateOrProvince xsi:nil="true"></StateOrProvince>
          <Telephone1 xsi:nil="true"></Telephone1><Telephone2 xsi:nil="true"></Telephone2><Telephone3 xsi:nil="true"></Telephone3>
          <TimeZoneRuleVersionNumber xsi:nil="true"></TimeZoneRuleVersionNumber><UPSZone xsi:nil="true"></UPSZone><UTCOffset xsi:nil="true"></UTCOffset>
          <UTCConversionTimeZoneCode xsi:nil="true"></UTCConversionTimeZoneCode>
        </Address>
      </Addresses>
    </Publisher>
    <RootComponents>
${resources.map((r) => `      <RootComponent type="61" schemaName="${esc(r.name)}" behavior="0" />`).join('\n')}
    </RootComponents>
    <MissingDependencies />
  </SolutionManifest>
</ImportExportXml>
`;

const customizationsXml = `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" OrganizationVersion="9.2.24101.191" OrganizationSchemaType="Standard" CRMServerServiceabilityVersion="9.2.24101.00191">
  <Entities />
  <Roles />
  <Workflows />
  <FieldSecurityProfiles />
  <Templates />
  <EntityMaps />
  <EntityRelationships />
  <OrganizationSettings />
  <optionsets />
  <WebResources>
${resources.map((r) => `    <WebResource>
      <WebResourceId>{${r.id}}</WebResourceId>
      <Name>${esc(r.name)}</Name>
      <DisplayName>${esc(r.display)}</DisplayName>
      <WebResourceType>${r.type}</WebResourceType>
      <IntroducedVersion>${VERSION}</IntroducedVersion>
      <IsEnabledForMobileClient>0</IsEnabledForMobileClient>
      <IsAvailableForMobileOffline>0</IsAvailableForMobileOffline>
      <DependencyXml />
      <IsCustomizable>1</IsCustomizable>
      <CanBeDeleted>1</CanBeDeleted>
      <IsHidden>0</IsHidden>
      <FileName>/WebResources/${esc(r.name)}</FileName>
    </WebResource>`).join('\n')}
  </WebResources>
  <CustomControls />
  <EntityDataProviders />
  <Languages>
    <Language>1049</Language>
  </Languages>
</ImportExportXml>
`;

const contentTypes = `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/octet-stream" /><Default Extension="html" ContentType="application/octet-stream" /><Default Extension="js" ContentType="application/octet-stream" /><Default Extension="css" ContentType="application/octet-stream" /><Default Extension="svg" ContentType="application/octet-stream" /><Default Extension="png" ContentType="application/octet-stream" /></Types>`;

// ---------- minimal ZIP writer ----------
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zip(entries) {
  const locals = []; const centrals = []; let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const comp = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x5a21, 12);           // fixed time/date (2025-01-01) for reproducible builds
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0x5a21, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, zip([
  { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
  { name: 'solution.xml', data: Buffer.from(solutionXml, 'utf8') },
  { name: 'customizations.xml', data: Buffer.from(customizationsXml, 'utf8') },
  ...resources.map((r) => ({ name: `WebResources/${r.name}`, data: r.data })),
]));
console.log(`Dataverse solution: ${OUT}`);
resources.forEach((r) => console.log(`  ${r.name}  (type ${r.type}, ${r.data.length} bytes)`));
