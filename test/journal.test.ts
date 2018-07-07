'use strict';




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
        

        /*
        let ctrl = new J.Util.Ctrl(null)
        ctrl.parser.resolveOffset("-1").then(offset => {
            let date = new Date(); 
            date.setDate(date.getDate()+offset[0]);
            let res = J.Util.formatDate(date, "dddd, LL" , ctrl.configuration.getLocale()); 

            console.log("Offset is "+res);
            assert.equal(true, res.length>0);
             
        }, err => {
            assert.fail; 
        }); 
        */
    }) 


    
});
