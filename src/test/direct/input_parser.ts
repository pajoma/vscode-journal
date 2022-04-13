import { MatchInput } from '../../provider';
import { TestLogger } from '../TestLogger';

let inputMatcher = new MatchInput(new TestLogger(false), "en-US");

testExpr1(); 

async function testExpr1() {
    let str = "next monday";
    let input = await inputMatcher.parseInput(str); 
    console.log(input.flags);


}



