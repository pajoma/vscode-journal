// Copyright (C) 2019  Patrick Maué
//
// This file is part of vscode-journal.
//
// vscode-journal is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// vscode-journal is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with vscode-journal.  If not, see <http://www.gnu.org/licenses/>.
//
'use strict';

import * as Msal from 'msal';
import * as Q from 'q';
import * as J from '../.';

/**
 * 
 */
export class MSGraph {
      /**
     *
     */
    constructor(public ctrl: J.Util.Ctrl) {
    }


    public getAzureConfig(): Msal.Configuration {
        /*

       auth: {
                clientId: "d9ee25d2-4472-40ba-849f-8691ad1210b0",
                authority: "https://login.microsoftonline.com/common"
            },
            cache: {
                cacheLocation: 'localStorage',
                storeAuthStateInCookie: true
            }*/
        var cacheLocation: Msal.CacheLocation = "localStorage"; 

        return {
            auth: {
                clientId: "d9ee25d2-4472-40ba-849f-8691ad1210b0",
                authority: "https://login.microsoftonline.com/common"
            }, 
            cache: {
                cacheLocation: "localStorage" as Msal.CacheLocation,
                storeAuthStateInCookie: true
            }
        }
    }

    public login(): Q.Promise<string> {
        return Q.Promise<string>((success, reject) => {
            try {
                var myMSALObj = new Msal.UserAgentApplication(this.getAzureConfig());

                var requestObj = {
                    scopes: ["user.read"]
                };

                myMSALObj.loginPopup(requestObj).then(function (loginResponse) {
                    //Login Success callback code here
                }).catch(function (error) {
                    console.log(error);
                });
            } catch (error) {
                this.ctrl.logger.error("Failed to call Azure", error); 
                reject(error); 

           
            }
            
        }); 
    }

}
