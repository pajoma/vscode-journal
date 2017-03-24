'use strict';
import * as assert from 'assert';
import Journal from '../src/journal'; 
import * as jrn from '../src/util'; 



// Defines a Mocha test suite to group tests of similar kind together
suite("Journal Unit Tests", () => {

    /*
    test("open weekday (\"last wednesday\")", done => {
        var journal:Journal = new Journal(null);

        journal.resolveOffset("next wednesday").then(offset => {

            done(); 
        }); 


    })
    */

    test("open weekday (\"-1\")", () => {
        let util:jrn.Util = new jrn.Util(null); 
        let config:jrn.Configuration = new jrn.Configuration(null); 
        let parser:jrn.Parser = new jrn.Parser(config, util);           


        parser.resolveOffset("-1").then(offset => {
            let date = new Date(); 
            date.setDate(date.getDate()+offset[0]);
            let res = util.formatDate(date); 

            console.log("Offset is "+util.formatDate(date));
            assert.equal(true, res.length>0);
             
        }, err => {
            assert.fail; 
        }); 
    }) 


    
});
