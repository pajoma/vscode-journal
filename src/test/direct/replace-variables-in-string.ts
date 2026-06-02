import { resolveDate as replaceDateFormats } from '../../shared/templates/template-engine';



let result: string = "no result";
result = replaceDateFormats("${year} and ${day}  and some ${month}", new Date());
console.log(result); 

result = replaceDateFormats("Local time ${localTime} and custom format ${d:YY} for year", new Date());
console.log(result); 