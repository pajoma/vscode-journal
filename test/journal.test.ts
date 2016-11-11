'use strict';
import * as assert from 'assert';
import Journal from '../src/journal'; 


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
        var journal:Journal = new Journal(null);

        journal.resolveOffset("-1").then(offset => {
            let date = new Date(); 
            date.setDate(date.getDate()+offset);
            let res = journal.formatDate(date); 

            console.log("Offset is "+journal.formatDate(date));
            assert.equal(true, res.length>0);
             
        }, err => {
            assert.fail; 
        }); 
    }) 


    
});
