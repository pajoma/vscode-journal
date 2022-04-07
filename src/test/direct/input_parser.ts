import { TestLogger } from '../TestLogger';
import { InputMatcher } from '../../features/InputMatcher';

let inputMatcher = new InputMatcher(new TestLogger());

testExpr1(); 

async function testExpr1() {
    let str = "next monday";
    let input = await inputMatcher.parseInput(str); 
    console.log(input.flags)


}



