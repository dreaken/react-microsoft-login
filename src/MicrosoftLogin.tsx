import * as React from "react";
import { UserAgentApplication, AuthResponse, AuthError } from "msal";

import {
  MicrosoftLoginProps,
  MicrosoftLoginState,
  GraphAPIUserData,
  MicrosoftLoginPrompt
} from "../index";
import MicrosoftLoginButton from "./MicrosoftLoginButton";
import { StringDict } from "msal/lib-commonjs/MsalTypes";

interface UserAgentApp {
  clientId: string;
  tenantUrl?: string;
  redirectUri?: string;
}
interface GraphAPITokenAndUser {
  msalInstance: UserAgentApplication;
  scopes: [string];
  withUserData: boolean;
  authCallback: any;
  isRedirect: boolean;
  extraQueryParameters?: StringDict;
}
interface PopupLogin {
  msalInstance: UserAgentApplication;
  scopes: [string];
  withUserData: boolean;
  authCallback: any;
  prompt?: MicrosoftLoginPrompt;
  extraQueryParameters?: StringDict;
}
interface RedirectLogin {
  msalInstance: UserAgentApplication;
  scopes: [string];
  prompt?: MicrosoftLoginPrompt;
  extraQueryParameters?: StringDict;
}

const CLIENT_ID_REGEX = /[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}/;
const getUserAgentApp = ({
  clientId,
  tenantUrl,
  redirectUri
}: UserAgentApp) => {
  if (clientId && CLIENT_ID_REGEX.test(clientId)) {
    return new UserAgentApplication({
      auth: {
        ...(redirectUri && { redirectUri }),
        ...(tenantUrl && { authority: tenantUrl }),
        clientId,
        validateAuthority: true,
        navigateToLoginRequestUrl: false
      }
    });
  }
};

const getScopes = (graphScopes: [string]) => {
  const scopes = graphScopes || [];
  if (!scopes.find((el: string) => el.toLowerCase() === "user.read")) {
    scopes.push("user.read");
  }
  return scopes;
};

export default class MicrosoftLogin extends React.Component<
  MicrosoftLoginProps,
  MicrosoftLoginState
> {
  constructor(props: any) {
    super(props);
    const {
      graphScopes,
      clientId,
      tenantUrl,
      redirectUri,
      extraQueryParameters
    } = props;
    this.state = {
      msalInstance: getUserAgentApp({ clientId, tenantUrl, redirectUri }),
      scopes: getScopes(graphScopes),
      extraQueryParameters: extraQueryParameters
    };
  }

  componentDidMount() {
    const { msalInstance, scopes, extraQueryParameters } = this.state;
    const { authCallback, withUserData = false } = this.props;
    if (!msalInstance) {
      this.log("Initialization", "clientID broken or not provided", true);
    } else {
      msalInstance.handleRedirectCallback(
        (error: AuthError, authResponse: AuthResponse) => {
          if (!error && authResponse) {
            this.log(
              "Fetch Azure AD 'token' with redirect SUCCEDEED",
              authResponse
            );
            this.log("Fetch Graph API 'access_token' in silent mode STARTED");
            this.getGraphAPITokenAndUser({
              msalInstance,
              scopes,
              withUserData,
              authCallback,
              isRedirect: true,
              extraQueryParameters
            });
          } else {
            this.log(
              "Fetch Azure AD 'token' with redirect FAILED",
              error,
              true
            );
            authCallback(error);
          }
        }
      );
    }
  }

  componentDidUpdate(prevProps: any) {
    const { clientId, tenantUrl, redirectUri } = this.props;
    if (
      prevProps.clientId !== clientId ||
      prevProps.tenantUrl !== tenantUrl ||
      prevProps.redirectUri !== redirectUri
    ) {
      this.setState({
        msalInstance: getUserAgentApp({ clientId, tenantUrl, redirectUri })
      });
    }
  }

  login = () => {
    const { msalInstance, scopes, extraQueryParameters } = this.state;
    const {
      withUserData = false,
      authCallback,
      forceRedirectStrategy = false,
      prompt
    } = this.props;

    if (msalInstance) {
      this.log("Login STARTED");
      if (forceRedirectStrategy || this.checkToIE()) {
        this.redirectLogin({
          msalInstance,
          scopes,
          prompt,
          extraQueryParameters
        });
      } else {
        this.popupLogin({
          msalInstance,
          scopes,
          withUserData,
          authCallback,
          prompt,
          extraQueryParameters
        });
      }
    } else {
      this.log("Login FAILED", "clientID broken or not provided", true);
    }
  };

  getGraphAPITokenAndUser({
    msalInstance,
    scopes,
    withUserData,
    authCallback,
    isRedirect,
    extraQueryParameters
  }: GraphAPITokenAndUser) {
    return msalInstance
      .acquireTokenSilent({ scopes, extraQueryParameters })
      .catch((error: any) => {
        this.log(
          "Fetch Graph API 'access_token' in silent mode is FAILED",
          error,
          true
        );
        if (isRedirect) {
          this.log("Fetch Graph API 'access_token' with redirect STARTED");
          msalInstance.acquireTokenRedirect({ scopes, extraQueryParameters });
        } else {
          this.log("Fetch Graph API 'access_token' with popup STARTED");
          msalInstance.acquireTokenPopup({ scopes, extraQueryParameters });
        }
      })
      .then((authResponseWithAccessToken: AuthResponse) => {
        this.log(
          "Fetch Graph API 'access_token' SUCCEDEED",
          authResponseWithAccessToken
        );
        if (withUserData) {
          this.getUserData(authResponseWithAccessToken);
        } else {
          this.log("Login SUCCEDED");
          authCallback(null, { authResponseWithAccessToken });
        }
      })
      .catch((error: AuthError) => {
        this.log("Login FAILED", error, true);
        authCallback(error);
      });
  }

  popupLogin({
    msalInstance,
    scopes,
    withUserData,
    authCallback,
    prompt,
    extraQueryParameters
  }: PopupLogin) {
    this.log("Fetch Azure AD 'token' with popup STARTED");
    msalInstance
      .loginPopup({ scopes, prompt, extraQueryParameters })
      .then((authResponse: AuthResponse) => {
        this.log("Fetch Azure AD 'token' with popup SUCCEDEED", authResponse);
        this.log("Fetch Graph API 'access_token' in silent mode STARTED");
        this.getGraphAPITokenAndUser({
          msalInstance,
          scopes,
          withUserData,
          authCallback,
          isRedirect: false,
          extraQueryParameters
        });
      })
      .catch((error: AuthError) => {
        this.log("Fetch Azure AD 'token' with popup FAILED", error, true);
        authCallback(error);
      });
  }

  redirectLogin({
    msalInstance,
    scopes,
    prompt,
    extraQueryParameters
  }: RedirectLogin) {
    this.log("Fetch Azure AD 'token' with redirect STARTED");
    msalInstance.loginRedirect({ scopes, prompt, extraQueryParameters });
  }

  getUserData(authResponseWithAccessToken: AuthResponse) {
    const { authCallback } = this.props;
    const { accessToken } = authResponseWithAccessToken;
    this.log("Fetch Graph API user data STARTED");
    const options = {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    };
    return fetch("https://graph.microsoft.com/v1.0/me", options)
      .then((response: Response) => response.json())
      .then((userData: GraphAPIUserData) => {
        this.log("Fetch Graph API user data SUCCEDEED", userData);
        this.log("Login SUCCEDED");
        authCallback(undefined, {
          ...userData,
          ...authResponseWithAccessToken
        });
      });
  }

  checkToIE(): boolean {
    const ua = window.navigator.userAgent;
    const msie = ua.indexOf("MSIE ");
    const msie11 = ua.indexOf("Trident/");
    const msedge = ua.indexOf("Edge/");
    const isIE = msie > 0 || msie11 > 0;
    const isEdge = msedge > 0;
    return isIE || isEdge;
  }

  log(name: string, content?: any, isError?: boolean) {
    const { debug } = this.props;
    if (debug) {
      const style = `background-color: ${
        isError ? "#990000" : "#009900"
      }; color: #ffffff; font-weight: 700; padding: 2px`;
      console.groupCollapsed("MSLogin debug");
      console.log(`%c${name}`, style);
      content && console.log(content.message || content);
      console.groupEnd();
    }
  }

  render() {
    const { buttonTheme, className, children } = this.props;
    return children ? (
      <div onClick={this.login}>{children}</div>
    ) : (
      <MicrosoftLoginButton
        buttonTheme={buttonTheme || "light"}
        buttonClassName={className}
        onClick={this.login}
      />
    );
  }
}
