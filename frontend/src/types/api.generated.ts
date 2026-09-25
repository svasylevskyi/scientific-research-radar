// Generated from backend route schemas. Run npm run contracts:generate; do not edit.
export interface paths {
    "/api/v1/admin/billing-sync": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Overview */
        get: operations["overview_api_v1_admin_billing_sync_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/billing-sync/{job_id}/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Retry */
        post: operations["retry_api_v1_admin_billing_sync__job_id__retry_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/billing-sync/checkouts/{checkout_id}/invoices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Invoices */
        get: operations["invoices_api_v1_admin_billing_sync_checkouts__checkout_id__invoices_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/digests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Digests */
        get: operations["list_digests_api_v1_admin_digests_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/digests/{digest_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Digest */
        get: operations["get_digest_api_v1_admin_digests__digest_id__get"];
        put?: never;
        post?: never;
        /** Delete Digest */
        delete: operations["delete_digest_api_v1_admin_digests__digest_id__delete"];
        options?: never;
        head?: never;
        /** Update Digest */
        patch: operations["update_digest_api_v1_admin_digests__digest_id__patch"];
        trace?: never;
    };
    "/api/v1/admin/digests/{digest_id}/costs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Digest Costs */
        get: operations["get_digest_costs_api_v1_admin_digests__digest_id__costs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/digests/{digest_id}/runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Digest Runs */
        get: operations["list_digest_runs_api_v1_admin_digests__digest_id__runs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/digests/{digest_id}/runs/{run_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Digest Run */
        get: operations["get_digest_run_api_v1_admin_digests__digest_id__runs__run_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/digests/{digest_id}/runs/{run_id}/costs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Digest Run Costs */
        get: operations["get_digest_run_costs_api_v1_admin_digests__digest_id__runs__run_id__costs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/digests/{digest_id}/runs/{run_id}/quality-evaluations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Quality Evaluations */
        get: operations["list_quality_evaluations_api_v1_admin_digests__digest_id__runs__run_id__quality_evaluations_get"];
        put?: never;
        /** Evaluate Run Quality */
        post: operations["evaluate_run_quality_api_v1_admin_digests__digest_id__runs__run_id__quality_evaluations_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/messages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Messages */
        get: operations["list_messages_api_v1_admin_messages_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/messages/{message_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Review Message */
        patch: operations["review_message_api_v1_admin_messages__message_id__patch"];
        trace?: never;
    };
    "/api/v1/admin/pricing": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Prices */
        get: operations["list_prices_api_v1_admin_pricing_get"];
        put?: never;
        /** Create Price */
        post: operations["create_price_api_v1_admin_pricing_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/pricing/{price_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Price */
        get: operations["get_price_api_v1_admin_pricing__price_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/research-quality": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Settings */
        get: operations["read_settings_api_v1_admin_research_quality_get"];
        put?: never;
        /** Update Settings */
        post: operations["update_settings_api_v1_admin_research_quality_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/research-quality/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** History */
        get: operations["history_api_v1_admin_research_quality_history_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/spending": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Spending */
        get: operations["get_spending_api_v1_admin_spending_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/subscription-access/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Overview */
        get: operations["overview_api_v1_admin_subscription_access__user_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/subscription-access/{user_id}/policy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Change */
        post: operations["change_api_v1_admin_subscription_access__user_id__policy_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/subscription-observation/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Overview */
        get: operations["overview_api_v1_admin_subscription_observation__user_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/subscription-observation/{user_id}/assignments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** History */
        get: operations["history_api_v1_admin_subscription_observation__user_id__assignments_get"];
        put?: never;
        /** Assign */
        post: operations["assign_api_v1_admin_subscription_observation__user_id__assignments_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/subscription-plans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Plans */
        get: operations["list_plans_api_v1_admin_subscription_plans_get"];
        put?: never;
        /** Save Plan */
        post: operations["save_plan_api_v1_admin_subscription_plans_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/subscription-plans/{code}/revisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** History */
        get: operations["history_api_v1_admin_subscription_plans__code__revisions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/subscription-plans/{code}/revisions/{revision}/check-stripe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Verify Stripe Mapping */
        post: operations["verify_stripe_mapping_api_v1_admin_subscription_plans__code__revisions__revision__check_stripe_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/subscription-plans/price-warnings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Preview Prices */
        post: operations["preview_prices_api_v1_admin_subscription_plans_price_warnings_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/subscription-plans/stripe-products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Stripe Products */
        get: operations["stripe_products_api_v1_admin_subscription_plans_stripe_products_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/subscription-testing": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Status */
        get: operations["status_api_v1_admin_subscription_testing_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/subscription-testing/checkout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Checkout */
        post: operations["checkout_api_v1_admin_subscription_testing_checkout_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/subscription-testing/mode": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Mode */
        get: operations["mode_api_v1_admin_subscription_testing_mode_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/subscription-testing/portal": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Portal */
        post: operations["portal_api_v1_admin_subscription_testing_portal_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/subscription-testing/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Refresh */
        post: operations["refresh_api_v1_admin_subscription_testing_refresh_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Users */
        get: operations["list_users_api_v1_admin_users_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/users/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get User */
        get: operations["get_user_api_v1_admin_users__user_id__get"];
        put?: never;
        post?: never;
        /** Delete User */
        delete: operations["delete_user_api_v1_admin_users__user_id__delete"];
        options?: never;
        head?: never;
        /** Update User */
        patch: operations["update_user_api_v1_admin_users__user_id__patch"];
        trace?: never;
    };
    "/api/v1/admin/users/{user_id}/role": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Update User Role */
        put: operations["update_user_role_api_v1_admin_users__user_id__role_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/forgot-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Forgot Password */
        post: operations["forgot_password_api_v1_auth_forgot_password_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Login */
        post: operations["login_api_v1_auth_login_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Logout */
        post: operations["logout_api_v1_auth_logout_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Refresh */
        post: operations["refresh_api_v1_auth_refresh_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Register */
        post: operations["register_api_v1_auth_register_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/register/{challenge_id}/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Confirm Registration */
        post: operations["confirm_registration_api_v1_auth_register__challenge_id__confirm_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/register/{challenge_id}/resend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Resend Registration */
        post: operations["resend_registration_api_v1_auth_register__challenge_id__resend_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/reset-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Finish Password Reset */
        post: operations["finish_password_reset_api_v1_auth_reset_password_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/contact": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Submit Message */
        post: operations["submit_message_api_v1_contact_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/digest-runs/active": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Active Digest Run */
        get: operations["get_active_digest_run_api_v1_digest_runs_active_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/digests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Digests */
        get: operations["list_digests_api_v1_digests_get"];
        put?: never;
        /** Create Digest */
        post: operations["create_digest_api_v1_digests_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/digests/{digest_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Digest */
        get: operations["get_digest_api_v1_digests__digest_id__get"];
        put?: never;
        post?: never;
        /** Delete Digest */
        delete: operations["delete_digest_api_v1_digests__digest_id__delete"];
        options?: never;
        head?: never;
        /** Update Digest */
        patch: operations["update_digest_api_v1_digests__digest_id__patch"];
        trace?: never;
    };
    "/api/v1/digests/{digest_id}/runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Digest Runs */
        get: operations["list_digest_runs_api_v1_digests__digest_id__runs_get"];
        put?: never;
        /** Run Digest Now */
        post: operations["run_digest_now_api_v1_digests__digest_id__runs_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/digests/{digest_id}/runs/{run_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Digest Run */
        get: operations["get_digest_run_api_v1_digests__digest_id__runs__run_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/digests/{digest_id}/runs/{run_id}/feedback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Update Digest Run Feedback */
        put: operations["update_digest_run_feedback_api_v1_digests__digest_id__runs__run_id__feedback_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/digests/{digest_id}/runs/{run_id}/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Retry Digest Run */
        post: operations["retry_digest_run_api_v1_digests__digest_id__runs__run_id__retry_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/digests/{digest_id}/schedule": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Save Digest Schedule
         * @description Create or replace saved schedule preferences; does not enqueue a run.
         */
        put: operations["save_digest_schedule_api_v1_digests__digest_id__schedule_put"];
        post?: never;
        /** Delete Digest Schedule */
        delete: operations["delete_digest_schedule_api_v1_digests__digest_id__schedule_delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/digests/{digest_id}/schedule/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Preview Digest Schedule */
        get: operations["preview_digest_schedule_api_v1_digests__digest_id__schedule_preview_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscription": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Mine */
        get: operations["mine_api_v1_subscription_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscription/billing": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Status */
        get: operations["status_api_v1_subscription_billing_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscription/billing/active-digests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Active Digests */
        get: operations["active_digests_api_v1_subscription_billing_active_digests_get"];
        /** Select Active Digests */
        put: operations["select_active_digests_api_v1_subscription_billing_active_digests_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscription/billing/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancel */
        post: operations["cancel_api_v1_subscription_billing_cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscription/billing/changes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Change Options */
        get: operations["change_options_api_v1_subscription_billing_changes_get"];
        put?: never;
        /** Schedule Change */
        post: operations["schedule_change_api_v1_subscription_billing_changes_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscription/billing/changes/{change_id}/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Retry Change */
        post: operations["retry_change_api_v1_subscription_billing_changes__change_id__retry_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscription/billing/changes/{change_id}/undo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Undo Change */
        post: operations["undo_change_api_v1_subscription_billing_changes__change_id__undo_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscription/billing/checkout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Checkout */
        post: operations["checkout_api_v1_subscription_billing_checkout_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscription/billing/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Notifications */
        get: operations["notifications_api_v1_subscription_billing_notifications_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscription/billing/portal": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Portal */
        post: operations["portal_api_v1_subscription_billing_portal_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscription/billing/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Refresh */
        post: operations["refresh_api_v1_subscription_billing_refresh_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscription/billing/resume": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Resume */
        post: operations["resume_api_v1_subscription_billing_resume_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscription/billing/upgrades": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Upgrade Options */
        get: operations["upgrade_options_api_v1_subscription_billing_upgrades_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscription/billing/upgrades/{quote_id}/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Confirm Upgrade */
        post: operations["confirm_upgrade_api_v1_subscription_billing_upgrades__quote_id__confirm_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscription/billing/upgrades/{quote_id}/payment": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Upgrade Payment */
        post: operations["upgrade_payment_api_v1_subscription_billing_upgrades__quote_id__payment_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscription/billing/upgrades/{quote_id}/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Retry Upgrade */
        post: operations["retry_upgrade_api_v1_subscription_billing_upgrades__quote_id__retry_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscription/billing/upgrades/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Preview Upgrade */
        post: operations["preview_upgrade_api_v1_subscription_billing_upgrades_preview_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscription/enrolment-plans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Enrolment Plans */
        get: operations["enrolment_plans_api_v1_subscription_enrolment_plans_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscription/free-digests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Free Digests */
        get: operations["free_digests_api_v1_subscription_free_digests_get"];
        /** Select Free Digests */
        put: operations["select_free_digests_api_v1_subscription_free_digests_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subscription/plans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Plans */
        get: operations["plans_api_v1_subscription_plans_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Me */
        get: operations["get_me_api_v1_users_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Me */
        patch: operations["update_me_api_v1_users_me_patch"];
        trace?: never;
    };
    "/api/v1/users/me/email-verification": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Pending Email */
        get: operations["pending_email_api_v1_users_me_email_verification_get"];
        put?: never;
        /** Start Email Change */
        post: operations["start_email_change_api_v1_users_me_email_verification_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/me/email-verification/{challenge_id}/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Confirm Email Change */
        post: operations["confirm_email_change_api_v1_users_me_email_verification__challenge_id__confirm_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/me/email-verification/{challenge_id}/resend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Resend Email Change */
        post: operations["resend_email_change_api_v1_users_me_email_verification__challenge_id__resend_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/me/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Update My Password */
        put: operations["update_my_password_api_v1_users_me_password_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/webhooks/stripe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Webhook */
        post: operations["webhook_api_v1_webhooks_stripe_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/webhooks/stripe-sandbox": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Webhook */
        post: operations["webhook_api_v1_webhooks_stripe_sandbox_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** AccessHistoryRead */
        AccessHistoryRead: {
            /** Change Note */
            change_note: string;
            /** Created At */
            created_at: string;
            /** Created By */
            created_by: string | null;
            /** Mode */
            mode: string;
            /** Version */
            version: number;
        };
        /** AccessPlanRead */
        AccessPlanRead: {
            configuration: components["schemas"]["EntitlementsRead"];
            /** Id */
            id: number;
            /** Name */
            name: string;
        };
        /** AccessPolicyRead */
        AccessPolicyRead: {
            /**
             * Mode
             * @enum {string}
             */
            mode: "complimentary" | "sandbox";
            /** Version */
            version: number;
        };
        /** AccessPolicyRequest */
        AccessPolicyRequest: {
            /** Change Note */
            change_note: string;
            /** Expected Version */
            expected_version: number;
            /**
             * Mode
             * @enum {string}
             */
            mode: "complimentary" | "sandbox";
        };
        /** AccessRead */
        AccessRead: {
            /** Access Until */
            access_until: string | null;
            /**
             * Active Digest Ids
             * @default []
             */
            active_digest_ids?: string[];
            /** Allowed */
            allowed: boolean;
            /** Billing Type */
            billing_type: ("free" | "stripe") | null;
            /** Cancel At Period End */
            cancel_at_period_end: boolean;
            /** Checkout Id */
            checkout_id: string | null;
            /** Create Allowed */
            create_allowed: boolean;
            /** Create Reasons */
            create_reasons: string[];
            /** Digest Count */
            digest_count: number;
            /**
             * Fallback
             * @default false
             */
            fallback?: boolean;
            /**
             * Fallback Eligible
             * @default false
             */
            fallback_eligible?: boolean;
            /** Fallback Since */
            fallback_since?: string | null;
            /** Grace Until */
            grace_until: string | null;
            /**
             * Mode
             * @enum {string}
             */
            mode: "complimentary" | "sandbox";
            /** Observed At */
            observed_at: string | null;
            /** Paid Through */
            paid_through?: string | null;
            /** Paper Limit */
            paper_limit: number;
            /** Payment Issue */
            payment_issue?: string | null;
            /**
             * Payment Status
             * @default
             */
            payment_status?: string;
            /** Period End */
            period_end: string | null;
            /** Period Start */
            period_start: string | null;
            plan: components["schemas"]["AccessPlanRead"] | null;
            /** Reason */
            reason: string;
            remaining: components["schemas"]["RemainingRead"];
            /** Research Warning */
            research_warning: string | null;
            /** Retained Digest Count */
            retained_digest_count: number;
            /**
             * Retry Allowed
             * @default false
             */
            retry_allowed?: boolean;
            /**
             * Retry Reasons
             * @default []
             */
            retry_reasons?: string[];
            /**
             * Run Allowed
             * @default false
             */
            run_allowed?: boolean;
            /**
             * Run Reasons
             * @default []
             */
            run_reasons?: string[];
            /** Schedule Allowed */
            schedule_allowed: boolean;
            /** Schedule Reasons */
            schedule_reasons: string[];
            /** Status */
            status: string | null;
            usage: components["schemas"]["UsageRead"];
            /** Version */
            version: number;
        };
        /** AccountAccessRead */
        AccountAccessRead: {
            /** Allowed */
            allowed: boolean;
            /** Mode */
            mode: string;
            /** Reason */
            reason: string;
        };
        /** ActiveDigests */
        ActiveDigests: {
            /** Digest Ids */
            digest_ids: string[];
        };
        /** ActiveDigestsRead */
        ActiveDigestsRead: {
            /** Available */
            available: boolean;
            /** Items */
            items: components["schemas"]["DigestChoiceRead"][];
            /** Limit */
            limit: number;
            /** Selected Ids */
            selected_ids: string[];
        };
        /** AdminAccessRead */
        AdminAccessRead: {
            /** Access Until */
            access_until: string | null;
            /**
             * Active Digest Ids
             * @default []
             */
            active_digest_ids?: string[];
            /** Allowed */
            allowed: boolean;
            /** Billing Type */
            billing_type: ("free" | "stripe") | null;
            /** Cancel At Period End */
            cancel_at_period_end: boolean;
            /** Checkout Id */
            checkout_id: string | null;
            /** Create Allowed */
            create_allowed: boolean;
            /** Create Reasons */
            create_reasons: string[];
            /** Digest Count */
            digest_count: number;
            /** Email */
            email: string;
            /**
             * Fallback
             * @default false
             */
            fallback?: boolean;
            /**
             * Fallback Eligible
             * @default false
             */
            fallback_eligible?: boolean;
            /** Fallback Since */
            fallback_since?: string | null;
            /** Grace Until */
            grace_until: string | null;
            /** History */
            history: components["schemas"]["AccessHistoryRead"][];
            /**
             * Mode
             * @enum {string}
             */
            mode: "complimentary" | "sandbox";
            /** Observed At */
            observed_at: string | null;
            /** Paid Through */
            paid_through?: string | null;
            /** Paper Limit */
            paper_limit: number;
            /** Payment Issue */
            payment_issue?: string | null;
            /**
             * Payment Status
             * @default
             */
            payment_status?: string;
            /** Period End */
            period_end: string | null;
            /** Period Start */
            period_start: string | null;
            plan: components["schemas"]["AccessPlanRead"] | null;
            /** Reason */
            reason: string;
            remaining: components["schemas"]["RemainingRead"];
            /** Research Warning */
            research_warning: string | null;
            /** Retained Digest Count */
            retained_digest_count: number;
            /**
             * Retry Allowed
             * @default false
             */
            retry_allowed?: boolean;
            /**
             * Retry Reasons
             * @default []
             */
            retry_reasons?: string[];
            /**
             * Run Allowed
             * @default false
             */
            run_allowed?: boolean;
            /**
             * Run Reasons
             * @default []
             */
            run_reasons?: string[];
            /** Schedule Allowed */
            schedule_allowed: boolean;
            /** Schedule Reasons */
            schedule_reasons: string[];
            /** Status */
            status: string | null;
            usage: components["schemas"]["UsageRead"];
            /** Version */
            version: number;
        };
        /** AdminDigestListResponse */
        AdminDigestListResponse: {
            /** Items */
            items: components["schemas"]["AdminDigestRead"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /** Total */
            total: number;
        };
        /** AdminDigestRead */
        AdminDigestRead: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Description */
            description: string | null;
            /** Exclude Keywords */
            exclude_keywords: string[];
            frequency: components["schemas"]["DigestFrequency"] | null;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Include Keywords */
            include_keywords: string[];
            /** Latest Successful Run At */
            latest_successful_run_at?: string | null;
            /** Maximum Papers */
            maximum_papers: number;
            owner: components["schemas"]["DigestOwnerRead"];
            /**
             * Owner Id
             * Format: uuid
             */
            owner_id: string;
            /**
             * Reporting From
             * Format: date
             */
            reporting_from: string;
            /**
             * Reporting To
             * Format: date
             */
            reporting_to: string;
            schedule?: components["schemas"]["DigestSchedule"] | null;
            /** Schedule Exhausted */
            readonly schedule_exhausted: boolean;
            /** Schedule Next At */
            schedule_next_at?: string | null;
            /**
             * Schedule Paused
             * @default false
             */
            schedule_paused?: boolean;
            /** Target Audience */
            target_audience: components["schemas"]["TargetAudience"][];
            /** Topic */
            topic: string;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /** AdminUserRead */
        AdminUserRead: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Full Name */
            full_name: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Is Active */
            is_active: boolean;
            /** Is Super Admin */
            is_super_admin: boolean;
            role: components["schemas"]["UserRole"];
            /** Subscription Plan Name */
            subscription_plan_name?: string | null;
        };
        /** AdminUserUpdate */
        AdminUserUpdate: {
            /** Email */
            email?: string | null;
            /** Full Name */
            full_name?: string | null;
            /** Is Active */
            is_active?: boolean | null;
        };
        /** AssignmentListRead */
        AssignmentListRead: {
            /** Items */
            items: components["schemas"]["AssignmentRead"][];
            /** Total */
            total: number;
        };
        /** AssignmentRead */
        AssignmentRead: {
            /** Change Note */
            change_note: string;
            /** Created At */
            created_at: string | null;
            /** Created By */
            created_by: string | null;
            /** Id */
            id: number | null;
            /** Mode */
            mode: string;
            plan: components["schemas"]["ObservationPlanRead"] | null;
            /** Version */
            version: number;
        };
        /** AssignmentRequest */
        AssignmentRequest: {
            /** Change Note */
            change_note: string;
            /** Expected Version */
            expected_version: number;
            /** Plan Revision Id */
            plan_revision_id?: number | null;
        };
        /** AuthResponse */
        AuthResponse: {
            /** Access Token */
            access_token: string;
            /** Expires In */
            expires_in: number;
            /**
             * Token Type
             * @default bearer
             */
            token_type?: string;
            user: components["schemas"]["UserRead"];
        };
        /** BillingAttemptRead */
        BillingAttemptRead: {
            /** Checkout Status */
            checkout_status: string;
            /** Code */
            code: string;
            /** Interval */
            interval: string;
            /** Plan Name */
            plan_name: string;
            /** Revision */
            revision: number;
            /** Subscription Status */
            subscription_status: string | null;
        };
        /** BillingJobRead */
        BillingJobRead: {
            /** Attempts */
            attempts: number;
            /**
             * Checkout Id
             * Format: uuid
             */
            checkout_id: string;
            /** Created At */
            created_at: string;
            /** Email */
            email: string;
            /** Event Type */
            event_type: string | null;
            /** Failures */
            failures: number;
            /** Id */
            id: string;
            /** Kind */
            kind: string;
            /** Last Attempt At */
            last_attempt_at: string | null;
            /** Last Error */
            last_error: string | null;
            /** Last Success At */
            last_success_at: string | null;
            /** Lease Expires At */
            lease_expires_at: string | null;
            /** Manual Retries */
            manual_retries: number;
            /** Next Attempt At */
            next_attempt_at: string | null;
            /** Price Matches */
            price_matches: boolean;
            /** Provider Observed At */
            provider_observed_at: string | null;
            /** Retried At */
            retried_at: string | null;
            /** Retried By */
            retried_by: string | null;
            /** State */
            state: string;
            /** Subscription Status */
            subscription_status: string | null;
            /**
             * User Id
             * Format: uuid
             */
            user_id: string;
        };
        /** BillingStatusRead */
        BillingStatusRead: {
            attempt: components["schemas"]["BillingAttemptRead"] | null;
            /** Cancel Allowed */
            cancel_allowed: boolean;
            /** Cancel At Period End */
            cancel_at_period_end: boolean;
            /** Checkout Allowed */
            checkout_allowed: boolean;
            /** Period End */
            period_end: string | null;
            /** Portal Allowed */
            portal_allowed: boolean;
            /** Reason */
            reason: string;
            /** Resume Allowed */
            resume_allowed: boolean;
            /** Sandbox */
            sandbox: boolean;
        };
        /** BillingSyncRead */
        BillingSyncRead: {
            /** Counts */
            counts: {
                [key: string]: number;
            };
            /** Items */
            items: components["schemas"]["BillingJobRead"][];
            /** Mode */
            mode: string;
            /** Total */
            total: number;
            /** Worker Healthy */
            worker_healthy: boolean;
            /** Worker Last Seen At */
            worker_last_seen_at: string | null;
        };
        /** ChangeOptionRead */
        ChangeOptionRead: {
            /** Code */
            code: string;
            /** Currency */
            currency: string;
            /** Email Delivery */
            email_delivery: boolean;
            /** Interval */
            interval: string;
            /** Manual Runs Per Month */
            manual_runs_per_month: number;
            /** Max Digests */
            max_digests: number;
            /** Max Papers Per Run */
            max_papers_per_run: number;
            /** Name */
            name: string;
            /** Papers Per Month */
            papers_per_month: number;
            /** Price */
            price: string;
            /** Revision */
            revision: number;
            /** Runs Per Month */
            runs_per_month: number;
            /** Schedule Frequencies */
            schedule_frequencies: ("daily" | "weekly" | "monthly" | "quarterly")[];
        };
        /** ChangeOptionsRead */
        ChangeOptionsRead: {
            change: components["schemas"]["ChangeRead"] | null;
            /** Digests */
            digests: components["schemas"]["DigestChoiceRead"][];
            /** Effective At */
            effective_at?: string | null;
            /** Items */
            items: components["schemas"]["ChangeOptionRead"][];
            /** Reason */
            reason: string;
        };
        /** ChangeRead */
        ChangeRead: {
            /** Currency */
            currency: string;
            /** Effective At */
            effective_at: string;
            /** Error */
            error: string | null;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Interval */
            interval: string;
            /** Plan Name */
            plan_name: string;
            /** Price */
            price: string;
            /** Retry Allowed */
            retry_allowed: boolean;
            /** State */
            state: string;
            /** Undo Allowed */
            undo_allowed: boolean;
        };
        /** ChangeSelection */
        ChangeSelection: {
            /** Code */
            code: string;
            /** Digest Ids */
            digest_ids: string[];
            /**
             * Expected Period End
             * Format: date-time
             */
            expected_period_end: string;
            /**
             * Interval
             * @enum {string}
             */
            interval: "monthly" | "annual";
            /** Revision */
            revision: number;
        };
        /** CheckoutRequest */
        CheckoutRequest: {
            /**
             * Interval
             * @enum {string}
             */
            interval: "monthly" | "annual";
            /** Revision */
            revision: number;
        };
        /** ContactMessageCreate */
        ContactMessageCreate: {
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Message */
            message: string;
            /** Name */
            name: string;
        };
        /** ContactMessageList */
        ContactMessageList: {
            /** Items */
            items: components["schemas"]["ContactMessageRead"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /** Total */
            total: number;
        };
        /** ContactMessageRead */
        ContactMessageRead: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Email */
            email: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Message */
            message: string;
            /** Name */
            name: string;
            /** Reviewed At */
            reviewed_at: string | null;
        };
        /** ContactMessageReceipt */
        ContactMessageReceipt: {
            /** Message */
            message: string;
        };
        /** ContactMessageReview */
        ContactMessageReview: {
            /** Reviewed */
            reviewed: boolean;
        };
        /** DigestChoiceRead */
        DigestChoiceRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Topic */
            topic: string;
        };
        /** DigestCreate */
        DigestCreate: {
            /** Description */
            description?: string | null;
            /** Exclude Keywords */
            exclude_keywords?: string[];
            frequency?: components["schemas"]["DigestFrequency"] | null;
            /** Include Keywords */
            include_keywords?: string[];
            /**
             * Maximum Papers
             * @default 20
             */
            maximum_papers?: number;
            /**
             * Reporting From
             * Format: date
             */
            reporting_from: string;
            /**
             * Reporting To
             * Format: date
             */
            reporting_to: string;
            /** Target Audience */
            target_audience: components["schemas"]["TargetAudience"][];
            /** Topic */
            topic: string;
        };
        /** DigestEmailDeliveryRead */
        DigestEmailDeliveryRead: {
            /** Attempts */
            attempts: number;
            /** Last Error */
            last_error: string | null;
            /** Sent At */
            sent_at: string | null;
            /** Status */
            status: string;
        };
        /**
         * DigestFrequency
         * @enum {string}
         */
        DigestFrequency: "daily" | "weekly" | "monthly" | "quarterly";
        /** DigestListResponse */
        DigestListResponse: {
            /** Items */
            items: components["schemas"]["DigestRead"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /** Total */
            total: number;
        };
        /** DigestOwnerRead */
        DigestOwnerRead: {
            /** Email */
            email: string;
            /** Full Name */
            full_name: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
        };
        /** DigestRead */
        DigestRead: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Description */
            description: string | null;
            /** Exclude Keywords */
            exclude_keywords: string[];
            frequency: components["schemas"]["DigestFrequency"] | null;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Include Keywords */
            include_keywords: string[];
            /** Latest Successful Run At */
            latest_successful_run_at?: string | null;
            /** Maximum Papers */
            maximum_papers: number;
            /**
             * Owner Id
             * Format: uuid
             */
            owner_id: string;
            /**
             * Reporting From
             * Format: date
             */
            reporting_from: string;
            /**
             * Reporting To
             * Format: date
             */
            reporting_to: string;
            schedule?: components["schemas"]["DigestSchedule"] | null;
            /** Schedule Exhausted */
            readonly schedule_exhausted: boolean;
            /** Schedule Next At */
            schedule_next_at?: string | null;
            /**
             * Schedule Paused
             * @default false
             */
            schedule_paused?: boolean;
            /** Target Audience */
            target_audience: components["schemas"]["TargetAudience"][];
            /** Topic */
            topic: string;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /** DigestRunBriefingRead */
        DigestRunBriefingRead: {
            /** Content Markdown */
            content_markdown: string;
            /** Data */
            data: {
                [key: string]: unknown;
            };
            /** Executive Summary */
            executive_summary: string;
            /** Title */
            title: string;
        };
        /** DigestRunDetailRead */
        DigestRunDetailRead: {
            briefing: components["schemas"]["DigestRunBriefingRead"] | null;
            /** Completed At */
            completed_at: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            current_stage: components["schemas"]["DigestRunStageType"] | null;
            /**
             * Digest Id
             * Format: uuid
             */
            digest_id: string;
            /** Digest Snapshot */
            digest_snapshot: {
                [key: string]: unknown;
            };
            email_delivery?: components["schemas"]["DigestEmailDeliveryRead"] | null;
            /** Error Message */
            error_message: string | null;
            /** Feedback Context */
            feedback_context: {
                [key: string]: unknown;
            }[];
            /** Feedback Created At */
            feedback_created_at: string | null;
            /** Feedback Text */
            feedback_text: string | null;
            /** Feedback Updated At */
            feedback_updated_at: string | null;
            /** Has Feedback */
            has_feedback: boolean;
            /** History Context */
            history_context: {
                [key: string]: unknown;
            }[];
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Model Name */
            model_name: string;
            /** Openai Response Id */
            openai_response_id: string | null;
            /**
             * Owner Id
             * Format: uuid
             */
            owner_id: string;
            /** Paper Count */
            paper_count: number;
            /** Paper Results */
            paper_results: components["schemas"]["DigestRunPaperRead"][];
            /** Prompt Version */
            prompt_version: string;
            quality_config: components["schemas"]["QualitySnapshot"] | null;
            /** Quality Delivery Blocked */
            quality_delivery_blocked: boolean;
            /** Quality Evaluated At */
            quality_evaluated_at: string | null;
            /** Quality Findings */
            quality_findings: components["schemas"]["QualityFinding"][];
            /**
             * Quality Status
             * @enum {string}
             */
            quality_status: "not_evaluated" | "pass" | "warning" | "hold";
            /** Relevance Data */
            relevance_data: {
                [key: string]: unknown;
            } | null;
            /** Request Count */
            request_count: number;
            /** Scheduled For */
            scheduled_for?: string | null;
            /** Search Data */
            search_data: {
                [key: string]: unknown;
            } | null;
            /** Stages */
            stages: components["schemas"]["DigestRunStageRead"][];
            /**
             * Started At
             * Format: date-time
             */
            started_at: string;
            status: components["schemas"]["DigestRunStatus"];
            trend_analysis: components["schemas"]["DigestRunTrendAnalysisRead"] | null;
            trigger: components["schemas"]["DigestRunTrigger"];
        };
        /** DigestRunFeedbackUpdate */
        DigestRunFeedbackUpdate: {
            /** Feedback Text */
            feedback_text: string;
        };
        /** DigestRunListResponse */
        DigestRunListResponse: {
            /** Items */
            items: components["schemas"]["DigestRunSummaryRead"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /** Total */
            total: number;
        };
        /** DigestRunPaperRead */
        DigestRunPaperRead: {
            paper: components["schemas"]["PaperRead"];
            /** Rank */
            rank: number;
            /** Relevance Data */
            relevance_data: {
                [key: string]: unknown;
            };
            /** Relevance Score */
            relevance_score: number;
            /** Search Data */
            search_data: {
                [key: string]: unknown;
            };
            /** Summary Data */
            summary_data: {
                [key: string]: unknown;
            } | null;
        };
        /** DigestRunStageRead */
        DigestRunStageRead: {
            /** Completed At */
            completed_at: string | null;
            /** Error Message */
            error_message: string | null;
            /** Model Name */
            model_name: string;
            /** Position */
            position: number;
            /** Progress Current */
            progress_current: number;
            /** Progress Total */
            progress_total: number;
            /** Prompt Version */
            prompt_version: string;
            /** Response Ids */
            response_ids: string[];
            /** Result Data */
            result_data: {
                [key: string]: unknown;
            } | null;
            stage: components["schemas"]["DigestRunStageType"];
            /** Started At */
            started_at: string | null;
            status: components["schemas"]["DigestRunStageStatus"];
            /** Usage Data */
            usage_data: {
                [key: string]: number;
            };
        };
        /**
         * DigestRunStageStatus
         * @enum {string}
         */
        DigestRunStageStatus: "pending" | "running" | "completed" | "failed";
        /**
         * DigestRunStageType
         * @enum {string}
         */
        DigestRunStageType: "discovery_relevance" | "paper_summaries" | "trend_analysis" | "digest_briefing";
        /**
         * DigestRunStatus
         * @enum {string}
         */
        DigestRunStatus: "queued" | "running" | "completed" | "failed";
        /** DigestRunSummaryRead */
        DigestRunSummaryRead: {
            /** Completed At */
            completed_at: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            current_stage: components["schemas"]["DigestRunStageType"] | null;
            /**
             * Digest Id
             * Format: uuid
             */
            digest_id: string;
            /** Error Message */
            error_message: string | null;
            /** Has Feedback */
            has_feedback: boolean;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Model Name */
            model_name: string;
            /**
             * Owner Id
             * Format: uuid
             */
            owner_id: string;
            /** Paper Count */
            paper_count: number;
            /** Prompt Version */
            prompt_version: string;
            /** Quality Delivery Blocked */
            quality_delivery_blocked: boolean;
            /**
             * Quality Status
             * @enum {string}
             */
            quality_status: "not_evaluated" | "pass" | "warning" | "hold";
            /** Request Count */
            request_count: number;
            /**
             * Started At
             * Format: date-time
             */
            started_at: string;
            status: components["schemas"]["DigestRunStatus"];
            trigger: components["schemas"]["DigestRunTrigger"];
        };
        /** DigestRunTrendAnalysisRead */
        DigestRunTrendAnalysisRead: {
            /** Data */
            data: {
                [key: string]: unknown;
            };
            /** Overview */
            overview: string;
        };
        /**
         * DigestRunTrigger
         * @enum {string}
         */
        DigestRunTrigger: "manual" | "scheduled";
        /**
         * DigestSchedule
         * @description Saved preferences only. No scheduler or execution state is created.
         */
        DigestSchedule: {
            /** Ends At */
            ends_at?: string | null;
            frequency: components["schemas"]["DigestFrequency"];
            /**
             * Send Email
             * @default true
             */
            send_email?: boolean;
            /**
             * Starts At
             * Format: date-time
             */
            starts_at: string;
            /** Time Zone */
            time_zone: string;
        };
        /** DigestUpdate */
        DigestUpdate: {
            /** Description */
            description?: string | null;
            /** Exclude Keywords */
            exclude_keywords?: string[] | null;
            frequency?: components["schemas"]["DigestFrequency"] | null;
            /** Include Keywords */
            include_keywords?: string[] | null;
            /** Maximum Papers */
            maximum_papers?: number | null;
            /** Reporting From */
            reporting_from?: string | null;
            /** Reporting To */
            reporting_to?: string | null;
            /** Target Audience */
            target_audience?: components["schemas"]["TargetAudience"][] | null;
            /** Topic */
            topic?: string | null;
        };
        /** EmailChangeRequest */
        EmailChangeRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
        };
        /** EntitlementsRead */
        EntitlementsRead: {
            /** Email Delivery */
            email_delivery: boolean;
            /** Manual Runs Per Month */
            manual_runs_per_month: number;
            /** Max Digests */
            max_digests: number;
            /** Max Papers Per Run */
            max_papers_per_run: number;
            /** Papers Per Month */
            papers_per_month: number;
            /** Runs Per Month */
            runs_per_month: number;
            /** Schedule Frequencies */
            schedule_frequencies: ("daily" | "weekly" | "monthly" | "quarterly")[];
        };
        /** FreeDigestChoiceRead */
        FreeDigestChoiceRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Schedule Paused */
            schedule_paused: boolean;
            /** Topic */
            topic: string;
        };
        /** FreeDigestSelection */
        FreeDigestSelection: {
            /** Digest Ids */
            digest_ids: string[];
        };
        /** FreeDigestsRead */
        FreeDigestsRead: {
            /** Available */
            available: boolean;
            /** Effective */
            effective: boolean;
            /** Items */
            items: components["schemas"]["FreeDigestChoiceRead"][];
            /** Limit */
            limit: number;
            /**
             * Plan Name
             * @default
             */
            plan_name?: string;
            /** Selected Ids */
            selected_ids: string[];
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /** InvoiceRead */
        InvoiceRead: {
            /** Amount Due */
            amount_due: number;
            /** Amount Paid */
            amount_paid: number;
            /** Amount Remaining */
            amount_remaining: number;
            /** Attempt Count */
            attempt_count: number;
            /** Billing Reason */
            billing_reason: string | null;
            /** Created At */
            created_at: string;
            /** Currency */
            currency: string;
            /** Id */
            id: string;
            /** Issue */
            issue: string | null;
            /** Next Payment Attempt */
            next_payment_attempt: string | null;
            /** Observed At */
            observed_at: string;
            /** Paid At */
            paid_at: string | null;
            /** Period End */
            period_end: string | null;
            /** Period Start */
            period_start: string | null;
            /** Status */
            status: string;
        };
        /** InvoiceReviewRead */
        InvoiceReviewRead: {
            account_access: components["schemas"]["AccountAccessRead"];
            /** Checked At */
            checked_at: string | null;
            /** Discrepancies */
            discrepancies: string[];
            /** History Complete */
            history_complete: boolean;
            /** Items */
            items: components["schemas"]["InvoiceRead"][];
            /** Latest Invoice Id */
            latest_invoice_id: string | null;
            payment: components["schemas"]["PaymentAssessmentRead"];
            /** Total */
            total: number;
        };
        /** LoginRequest */
        LoginRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Password */
            password: string;
        };
        /** MessageResponse */
        MessageResponse: {
            /** Message */
            message: string;
        };
        /** NotificationRead */
        NotificationRead: {
            /** Created At */
            created_at: string;
            /** Email Status */
            email_status: string;
            /** Id */
            id: string;
            /** Subject */
            subject: string;
            /** Text */
            text: string;
        };
        /** NotificationsRead */
        NotificationsRead: {
            /** Items */
            items: components["schemas"]["NotificationRead"][];
        };
        /** ObservationAssessmentRead */
        ObservationAssessmentRead: {
            /** At */
            at: string;
            /** Reasons */
            reasons: string[];
            request_context: components["schemas"]["ObservationContextRead"];
            /** Would Block */
            would_block: boolean;
        };
        /** ObservationContextRead */
        ObservationContextRead: {
            /** Email */
            email: boolean;
            /** Frequency */
            frequency: string | null;
        };
        /** ObservationEntryRead */
        ObservationEntryRead: {
            /** Actual Papers */
            actual_papers: number;
            /** Assessments */
            assessments: components["schemas"]["ObservationAssessmentRead"][];
            /** Assignment Id */
            assignment_id: number | null;
            /** Attempts */
            attempts: number;
            /** Created At */
            created_at: string;
            /** Digest Id */
            digest_id: string | null;
            /** Requested Papers */
            requested_papers: number;
            /** Run Id */
            run_id: string | null;
            /**
             * Run Key
             * Format: uuid
             */
            run_key: string;
            /** State */
            state: string;
            /** Topic */
            topic: string;
            /** Trigger */
            trigger: string;
            /** Updated At */
            updated_at: string;
        };
        /** ObservationOverviewRead */
        ObservationOverviewRead: {
            /** Access */
            access: string;
            assignment: components["schemas"]["AssignmentRead"];
            /** Digest Count */
            digest_count: number;
            /** Items */
            items: components["schemas"]["ObservationEntryRead"][];
            /** Mode */
            mode: string;
            /**
             * Period End
             * Format: date
             */
            period_end: string;
            /**
             * Period Start
             * Format: date
             */
            period_start: string;
            remaining: components["schemas"]["RemainingRead"];
            /** Total */
            total: number;
            /** Tracking Since */
            tracking_since: string | null;
            usage: components["schemas"]["ObservationUsageRead"];
            user: components["schemas"]["ObservationUserRead"];
        };
        /** ObservationPlanRead */
        ObservationPlanRead: {
            /** Code */
            code: string;
            configuration: components["schemas"]["PlanConfigurationRead"];
            /** Id */
            id: number;
            /** Revision */
            revision: number;
        };
        /** ObservationUsageRead */
        ObservationUsageRead: {
            /** Completed Papers */
            completed_papers: number;
            /** Completed Runs */
            completed_runs: number;
            /** Manual Runs */
            manual_runs: number;
            /** Released Runs */
            released_runs: number;
            /** Reserved Papers */
            reserved_papers: number;
            /** Reserved Runs */
            reserved_runs: number;
        };
        /** ObservationUserRead */
        ObservationUserRead: {
            /** Email */
            email: string;
            /** Full Name */
            full_name: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
        };
        /** PaperRead */
        PaperRead: {
            /** Abstract */
            abstract: string | null;
            /** Authors */
            authors: string[];
            /** Doi */
            doi: string | null;
            /** External Id */
            external_id: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Published Date */
            published_date: string | null;
            /** Source Name */
            source_name: string;
            /** Title */
            title: string;
            /** Url */
            url: string;
        };
        /** PasswordRecoveryRequest */
        PasswordRecoveryRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
        };
        /** PasswordResetRequest */
        PasswordResetRequest: {
            /** Password */
            password: string;
            /** Password Confirmation */
            password_confirmation: string;
            /** Token */
            token: string;
        };
        /** PaymentAssessmentRead */
        PaymentAssessmentRead: {
            /** Covered */
            covered: boolean;
            /** Grace Until */
            grace_until: string | null;
            /** Issue */
            issue: string | null;
            /** Paid Through */
            paid_through: string | null;
            /** Status */
            status: string;
        };
        /**
         * PlanConfigurationRead
         * @description Historical revisions may predate billing/publication fields.
         *
         *     Do not reapply today's publishing validators or inject defaults on reads.
         *     Monetary values retain the decimal strings stored in the revision.
         */
        PlanConfigurationRead: {
            /** Annual Price */
            annual_price: string | null;
            /**
             * Billing Type
             * @default stripe
             * @enum {string}
             */
            billing_type?: "stripe" | "free";
            /** Currency */
            currency: string;
            /** Description */
            description: string;
            /**
             * Display Order
             * @default 0
             */
            display_order?: number;
            /** Email Delivery */
            email_delivery: boolean;
            /** Manual Runs Per Month */
            manual_runs_per_month: number;
            /** Max Digests */
            max_digests: number;
            /** Max Papers Per Run */
            max_papers_per_run: number;
            /** Monthly Price */
            monthly_price: string;
            /** Name */
            name: string;
            /** Papers Per Month */
            papers_per_month: number;
            /** Runs Per Month */
            runs_per_month: number;
            /** Schedule Frequencies */
            schedule_frequencies: ("daily" | "weekly" | "monthly" | "quarterly")[];
            /** State */
            state: string;
            stripe_sandbox?: components["schemas"]["StripeMappingRead"] | null;
            /**
             * Subscriber Visible
             * @default false
             */
            subscriber_visible?: boolean;
            /** Tax Display */
            tax_display: string;
            /** Trial Days */
            trial_days: number;
        };
        /** PlanListRead */
        PlanListRead: {
            /** Items */
            items: components["schemas"]["PlanRevisionRead"][];
            /** Total */
            total: number;
        };
        /** PlanRevisionRead */
        PlanRevisionRead: {
            /** Change Note */
            change_note: string;
            /** Code */
            code: string;
            configuration: components["schemas"]["PlanConfigurationRead"];
            /** Created At */
            created_at: string;
            /** Created By */
            created_by: string | null;
            /** Id */
            id: number;
            /** Revision */
            revision: number;
        };
        /** PricePreview */
        PricePreview: {
            /**
             * Code
             * @default
             */
            code?: string;
            configuration: components["schemas"]["SubscriptionPlanConfiguration"];
        };
        /** PriceWarningsRead */
        PriceWarningsRead: {
            /** Warnings */
            warnings: string[];
        };
        /** PublicPlanRead */
        PublicPlanRead: {
            /** Annual Price */
            annual_price: string | null;
            /**
             * Billing Type
             * @enum {string}
             */
            billing_type: "stripe" | "free";
            /** Code */
            code: string;
            /** Currency */
            currency: string;
            /** Description */
            description: string;
            /** Email Delivery */
            email_delivery: boolean;
            /** Manual Runs Per Month */
            manual_runs_per_month: number;
            /** Max Digests */
            max_digests: number;
            /** Max Papers Per Run */
            max_papers_per_run: number;
            /** Monthly Price */
            monthly_price: string;
            /** Name */
            name: string;
            /** Papers Per Month */
            papers_per_month: number;
            /** Revision */
            revision: number;
            /** Runs Per Month */
            runs_per_month: number;
            /** Schedule Frequencies */
            schedule_frequencies: ("daily" | "weekly" | "monthly" | "quarterly")[];
            /** Tax Display */
            tax_display: string;
        };
        /** PublicPlansRead */
        PublicPlansRead: {
            /** Items */
            items: components["schemas"]["PublicPlanRead"][];
            /** Sandbox */
            sandbox: boolean;
        };
        /** QualityConfig */
        QualityConfig: {
            /**
             * Check Duplicates
             * @default true
             */
            check_duplicates?: boolean;
            /**
             * Check Reporting Dates
             * @default true
             */
            check_reporting_dates?: boolean;
            /**
             * Check Source Access
             * @default true
             */
            check_source_access?: boolean;
            /**
             * Mode
             * @default observe
             * @enum {string}
             */
            mode?: "off" | "observe" | "enforce";
            /**
             * Sparse Paper Threshold
             * @default 3
             */
            sparse_paper_threshold?: number;
        };
        /** QualityEvaluationHistory */
        QualityEvaluationHistory: {
            /** Items */
            items: components["schemas"]["QualityEvaluationRead"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /** Total */
            total: number;
        };
        /** QualityEvaluationRead */
        QualityEvaluationRead: {
            config: components["schemas"]["QualitySnapshot"];
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Created By */
            created_by: string | null;
            /** Created By Name */
            created_by_name: string;
            /** Findings */
            findings: components["schemas"]["QualityFinding"][];
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Run Id
             * Format: uuid
             */
            run_id: string;
            /**
             * Status
             * @enum {string}
             */
            status: "pass" | "warning" | "hold";
        };
        /** QualityEvaluationRequest */
        QualityEvaluationRequest: {
            /** Expected Settings Version */
            expected_settings_version: number;
        };
        /** QualityFinding */
        QualityFinding: {
            /** Code */
            code: string;
            /** Message */
            message: string;
            /** Paper Ids */
            paper_ids?: string[];
            /**
             * Severity
             * @enum {string}
             */
            severity: "warning" | "hold";
        };
        /** QualitySettingsHistory */
        QualitySettingsHistory: {
            /** Items */
            items: components["schemas"]["QualitySettingsRead"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /** Total */
            total: number;
        };
        /** QualitySettingsRead */
        QualitySettingsRead: {
            /** Change Reason */
            change_reason: string;
            config: components["schemas"]["QualityConfig"];
            /** Created At */
            created_at: string | null;
            /** Created By Name */
            created_by_name: string | null;
            /** Version */
            version: number;
        };
        /** QualitySettingsUpdate */
        QualitySettingsUpdate: {
            /** Change Reason */
            change_reason: string;
            config: components["schemas"]["QualityConfig"];
            /** Expected Version */
            expected_version: number;
        };
        /** QualitySnapshot */
        QualitySnapshot: {
            config: components["schemas"]["QualityConfig"];
            /** Engine Version */
            engine_version: string;
            /** Version */
            version: number;
        };
        /** QueuedRead */
        QueuedRead: {
            /** Queued */
            queued: boolean;
        };
        /** RadarPriceCreate */
        RadarPriceCreate: {
            /** Cache Write Per Million */
            cache_write_per_million?: number | string | null;
            /** Cached Input Per Million */
            cached_input_per_million: number | string;
            /** Input Per Million */
            input_per_million: number | string;
            /** Max Input Tokens */
            max_input_tokens: number;
            /** Model Name */
            model_name: string;
            /** Output Per Million */
            output_per_million: number | string;
            /** Version */
            version: string;
            /** Web Search Per Call */
            web_search_per_call: number | string;
        };
        /** RadarPriceDetailRead */
        RadarPriceDetailRead: {
            /** Cache Write Per Million */
            cache_write_per_million?: string | null;
            /** Cached Input Per Million */
            cached_input_per_million: string;
            /** Created At */
            created_at: string;
            /** Created By */
            created_by: string | null;
            /** Id */
            id: number;
            /** Input Per Million */
            input_per_million: string;
            /** Is Current */
            is_current: boolean;
            /** Max Input Tokens */
            max_input_tokens: number;
            /** Model Name */
            model_name: string;
            /** Output Per Million */
            output_per_million: string;
            /** Version */
            version: string;
            /** Web Search Per Call */
            web_search_per_call: string;
        };
        /** RadarPriceRead */
        RadarPriceRead: {
            /** Cache Write Per Million */
            cache_write_per_million?: string | null;
            /** Cached Input Per Million */
            cached_input_per_million: string;
            /** Created At */
            created_at: string;
            /** Created By */
            created_by: string | null;
            /** Id */
            id: number;
            /** Input Per Million */
            input_per_million: string;
            /** Max Input Tokens */
            max_input_tokens: number;
            /** Model Name */
            model_name: string;
            /** Output Per Million */
            output_per_million: string;
            /** Version */
            version: string;
            /** Web Search Per Call */
            web_search_per_call: string;
        };
        /** RadarPricesRead */
        RadarPricesRead: {
            /** Items */
            items: components["schemas"]["RadarPriceDetailRead"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /** Total */
            total: number;
        };
        /** RedirectRead */
        RedirectRead: {
            /** Url */
            url: string;
        };
        /** RegisterRequest */
        RegisterRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Full Name */
            full_name: string;
            /** Password */
            password: string;
            /** Password Confirmation */
            password_confirmation: string;
        };
        /** RemainingRead */
        RemainingRead: {
            /** Digests */
            digests: number | null;
            /** Manual Runs */
            manual_runs: number | null;
            /** Papers */
            papers: number | null;
            /** Runs */
            runs: number | null;
        };
        /** SandboxAttemptRead */
        SandboxAttemptRead: {
            /** Cancel At Period End */
            cancel_at_period_end: boolean;
            /** Checkout Status */
            checkout_status: string;
            /** Created At */
            created_at: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Interval */
            interval: string;
            /** Observed At */
            observed_at: string | null;
            /** Period End */
            period_end: string | null;
            /** Plan Revision Id */
            plan_revision_id: number;
            /** Price Matches */
            price_matches: boolean;
            /** Revision */
            revision: number;
            /** Subscription Status */
            subscription_status: string | null;
        };
        /** SandboxOverviewRead */
        SandboxOverviewRead: {
            /** Attempts */
            attempts: components["schemas"]["SandboxAttemptRead"][];
            /** Enabled */
            enabled: boolean;
            /** Mode */
            mode: string;
            plan: components["schemas"]["SandboxPlanRead"] | null;
            /** Portal Available */
            portal_available: boolean;
        };
        /** SandboxPlanRead */
        SandboxPlanRead: {
            configuration: components["schemas"]["PlanConfigurationRead"];
            /** Revision */
            revision: number;
        };
        /** SavedPlanRead */
        SavedPlanRead: {
            /** Change Note */
            change_note: string;
            /** Code */
            code: string;
            configuration: components["schemas"]["PlanConfigurationRead"];
            /** Created At */
            created_at: string;
            /** Created By */
            created_by: string | null;
            /** Id */
            id: number;
            /** Revision */
            revision: number;
            /** Warnings */
            warnings: string[];
        };
        /** SchedulePreviewRead */
        SchedulePreviewRead: {
            /** Active Run Id */
            active_run_id?: string | null;
            /** Allowance Available At */
            allowance_available_at?: string | null;
            /**
             * As Of
             * Format: date-time
             */
            as_of: string;
            /**
             * Exhausted
             * @default false
             */
            exhausted?: boolean;
            /** Next Scheduled At */
            next_scheduled_at?: string | null;
            /**
             * Send Email
             * @default false
             */
            send_email?: boolean;
            /**
             * State
             * @enum {string}
             */
            state: "not_scheduled" | "scheduled" | "due" | "waiting_for_run" | "waiting_for_allowance" | "waiting_for_subscription" | "queued" | "running" | "ended";
            /** Subscription Message */
            subscription_message?: string | null;
            /** Time Zone */
            time_zone?: string | null;
            /** Upcoming Runs */
            upcoming_runs?: string[];
            /** Waiting Digest Id */
            waiting_digest_id?: string | null;
        };
        /** Selection */
        Selection: {
            /** Code */
            code: string;
            /**
             * Interval
             * @enum {string}
             */
            interval: "monthly" | "annual";
            /** Revision */
            revision: number;
        };
        /** SpendingChargeRead */
        SpendingChargeRead: {
            /** Line Item */
            line_item: string;
            /** Reported Usd */
            reported_usd: string;
        };
        /** SpendingDayRead */
        SpendingDayRead: {
            /**
             * Date
             * Format: date
             */
            date: string;
            /** Known Estimated Usd */
            known_estimated_usd: string;
            /** Reported Usd */
            reported_usd: string | null;
            /** Requests */
            requests: number;
            /** Unknown Requests */
            unknown_requests: number;
        };
        /** SpendingReportRead */
        SpendingReportRead: {
            /** Charges */
            charges: components["schemas"]["SpendingChargeRead"][];
            /** Currency */
            currency: string;
            /** Daily */
            daily: components["schemas"]["SpendingDayRead"][];
            /** Fetched At */
            fetched_at: string;
            /**
             * From Date
             * Format: date
             */
            from_date: string;
            /** Known Estimated Usd */
            known_estimated_usd: string;
            /** Legacy Runs */
            legacy_runs: number;
            /** Project Id */
            project_id: string;
            /** Reported Usd */
            reported_usd: string;
            /**
             * To Date
             * Format: date
             */
            to_date: string;
            /** Unknown Requests */
            unknown_requests: number;
        };
        /** StripeMappingCheckRead */
        StripeMappingCheckRead: {
            /** Checked At */
            checked_at: string;
            /** Code */
            code: string;
            /** Environment */
            environment: string;
            /** Issues */
            issues: string[];
            /** Matches */
            matches: boolean;
            /** Prices */
            prices: components["schemas"]["StripePriceCheckRead"][];
            /** Revision */
            revision: number;
        };
        /** StripeMappingRead */
        StripeMappingRead: {
            /** Annual Price Id */
            annual_price_id?: string | null;
            /** Monthly Price Id */
            monthly_price_id: string;
            /** Product Id */
            product_id: string;
        };
        /** StripeModeRead */
        StripeModeRead: {
            /** Checkout Enabled */
            checkout_enabled: boolean;
            /**
             * Mode
             * @enum {string}
             */
            mode: "sandbox" | "live";
        };
        /** StripePriceCheckRead */
        StripePriceCheckRead: {
            /** Currency */
            currency: string | null;
            /** Interval */
            interval: string;
            /** Price Id */
            price_id: string;
            /** Tax Behavior */
            tax_behavior: string | null;
            /** Unit Amount */
            unit_amount: number | null;
        };
        /** StripePriceRead */
        StripePriceRead: {
            /** Amount */
            amount: string;
            /** Currency */
            currency: string;
            /** Id */
            id: string;
            /** Interval */
            interval: string;
        };
        /** StripeProductRead */
        StripeProductRead: {
            /** Id */
            id: string;
            /** Mapped Plan Codes */
            mapped_plan_codes: string[];
            /** Name */
            name: string;
            /** Prices */
            prices: components["schemas"]["StripePriceRead"][];
        };
        /** StripeProductsRead */
        StripeProductsRead: {
            /** Items */
            items: components["schemas"]["StripeProductRead"][];
        };
        /** StripeSandboxMapping */
        StripeSandboxMapping: {
            /** Annual Price Id */
            annual_price_id?: string | null;
            /** Monthly Price Id */
            monthly_price_id: string;
            /** Product Id */
            product_id: string;
        };
        /** SubscriptionPlanConfiguration */
        SubscriptionPlanConfiguration: {
            /** Annual Price */
            annual_price?: number | string | null;
            /**
             * Billing Type
             * @default stripe
             * @enum {string}
             */
            billing_type?: "stripe" | "free";
            /**
             * Currency
             * @default EUR
             * @enum {string}
             */
            currency?: "EUR" | "USD" | "GBP" | "PLN";
            /**
             * Description
             * @default
             */
            description?: string;
            /**
             * Display Order
             * @default 0
             */
            display_order?: number;
            /**
             * Email Delivery
             * @default true
             */
            email_delivery?: boolean;
            /** Manual Runs Per Month */
            manual_runs_per_month: number;
            /** Max Digests */
            max_digests: number;
            /** Max Papers Per Run */
            max_papers_per_run: number;
            /** Monthly Price */
            monthly_price: number | string;
            /** Name */
            name: string;
            /** Papers Per Month */
            papers_per_month: number;
            /** Runs Per Month */
            runs_per_month: number;
            /** Schedule Frequencies */
            schedule_frequencies?: ("daily" | "weekly" | "monthly" | "quarterly")[];
            /**
             * State
             * @default draft
             * @enum {string}
             */
            state?: "draft" | "reviewed" | "archived";
            stripe_sandbox?: components["schemas"]["StripeSandboxMapping"] | null;
            /**
             * Subscriber Visible
             * @default false
             */
            subscriber_visible?: boolean;
            /**
             * Tax Display
             * @default undecided
             * @enum {string}
             */
            tax_display?: "undecided" | "inclusive" | "exclusive";
            /**
             * Trial Days
             * @default 0
             */
            trial_days?: number;
        };
        /** SubscriptionPlanSave */
        SubscriptionPlanSave: {
            /** Change Note */
            change_note: string;
            /** Code */
            code: string;
            configuration: components["schemas"]["SubscriptionPlanConfiguration"];
            /** Expected Revision */
            expected_revision: number;
        };
        /**
         * TargetAudience
         * @enum {string}
         */
        TargetAudience: "researchers" | "builders_technical_teams" | "science_communicators_educators" | "executives_decision_makers" | "general";
        /** UpgradeOptionRead */
        UpgradeOptionRead: {
            /** Code */
            code: string;
            /** Currency */
            currency: string;
            /** Interval */
            interval: string;
            /** Name */
            name: string;
            /** Price */
            price: string;
            /** Revision */
            revision: number;
        };
        /** UpgradeOptionsRead */
        UpgradeOptionsRead: {
            /** Items */
            items: components["schemas"]["UpgradeOptionRead"][];
            /** Reason */
            reason: string;
            upgrade: components["schemas"]["UpgradeRead"] | null;
        };
        /** UpgradeRead */
        UpgradeRead: {
            /** Amount Due */
            amount_due: number;
            /** Charge */
            charge: number;
            /** Confirm Allowed */
            confirm_allowed: boolean;
            /** Credit */
            credit: number;
            /** Currency */
            currency: string;
            /** Error */
            error: string | null;
            /** Expires At */
            expires_at: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Interval */
            interval: string;
            limits: components["schemas"]["EntitlementsRead"];
            /** Payment Allowed */
            payment_allowed: boolean;
            /** Pending Until */
            pending_until: string | null;
            /** Period End */
            period_end: string;
            /** Plan Name */
            plan_name: string;
            /** Proration At */
            proration_at: string;
            /** Recurring Price */
            recurring_price: string;
            /** Retry Allowed */
            retry_allowed: boolean;
            /** State */
            state: string;
        };
        /** UpgradeSelection */
        UpgradeSelection: {
            /** Code */
            code: string;
            /** Revision */
            revision: number;
        };
        /** UsageRead */
        UsageRead: {
            /** Completed Papers */
            completed_papers: number;
            /** Completed Runs */
            completed_runs: number;
            /** Manual Runs */
            manual_runs: number;
            /** Reserved Papers */
            reserved_papers: number;
            /** Reserved Runs */
            reserved_runs: number;
        };
        /** UserListResponse */
        UserListResponse: {
            /** Items */
            items: components["schemas"]["AdminUserRead"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /** Total */
            total: number;
        };
        /** UserPasswordUpdate */
        UserPasswordUpdate: {
            /** Current Password */
            current_password: string;
            /** New Password */
            new_password: string;
            /** New Password Confirmation */
            new_password_confirmation: string;
        };
        /** UserProfileUpdate */
        UserProfileUpdate: {
            /** Email */
            email?: string | null;
            /** Full Name */
            full_name?: string | null;
        };
        /** UserRead */
        UserRead: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Full Name */
            full_name: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Is Active */
            is_active: boolean;
            /** Is Super Admin */
            is_super_admin: boolean;
            role: components["schemas"]["UserRole"];
        };
        /**
         * UserRole
         * @enum {string}
         */
        UserRole: "user" | "admin";
        /** UserRoleUpdate */
        UserRoleUpdate: {
            role: components["schemas"]["UserRole"];
        };
        /** ValidationError */
        ValidationError: {
            /** Context */
            ctx?: Record<string, never>;
            /** Input */
            input?: unknown;
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
        };
        /** VerificationCode */
        VerificationCode: {
            /** Code */
            code: string;
        };
        /** VerificationRead */
        VerificationRead: {
            /**
             * Code Expires At
             * Format: date-time
             */
            code_expires_at: string;
            /** Email */
            email: string;
            /**
             * Expires At
             * Format: date-time
             */
            expires_at: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Sent At
             * Format: date-time
             */
            sent_at: string;
        };
        /** WebhookReceiptRead */
        WebhookReceiptRead: {
            /**
             * Ignored
             * @default false
             */
            ignored?: boolean;
            /**
             * Queued
             * @default false
             */
            queued?: boolean;
            /** Received */
            received: boolean;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    overview_api_v1_admin_billing_sync_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                state?: ("pending" | "processing" | "retry" | "failed" | "processed") | null;
                user_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BillingSyncRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    retry_api_v1_admin_billing_sync__job_id__retry_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QueuedRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    invoices_api_v1_admin_billing_sync_checkouts__checkout_id__invoices_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path: {
                checkout_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoiceReviewRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_digests_api_v1_admin_digests_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                owner_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminDigestListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_digest_api_v1_admin_digests__digest_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                digest_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminDigestRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_digest_api_v1_admin_digests__digest_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                digest_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_digest_api_v1_admin_digests__digest_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                digest_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DigestUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminDigestRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_digest_costs_api_v1_admin_digests__digest_id__costs_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                digest_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_digest_runs_api_v1_admin_digests__digest_id__runs_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path: {
                digest_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DigestRunListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_digest_run_api_v1_admin_digests__digest_id__runs__run_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                digest_id: string;
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DigestRunDetailRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_digest_run_costs_api_v1_admin_digests__digest_id__runs__run_id__costs_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                digest_id: string;
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_quality_evaluations_api_v1_admin_digests__digest_id__runs__run_id__quality_evaluations_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path: {
                digest_id: string;
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QualityEvaluationHistory"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    evaluate_run_quality_api_v1_admin_digests__digest_id__runs__run_id__quality_evaluations_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                digest_id: string;
                run_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QualityEvaluationRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QualityEvaluationRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_messages_api_v1_admin_messages_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactMessageList"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    review_message_api_v1_admin_messages__message_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                message_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ContactMessageReview"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactMessageRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_prices_api_v1_admin_pricing_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RadarPricesRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_price_api_v1_admin_pricing_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RadarPriceCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RadarPriceRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_price_api_v1_admin_pricing__price_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                price_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RadarPriceDetailRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_settings_api_v1_admin_research_quality_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QualitySettingsRead"];
                };
            };
        };
    };
    update_settings_api_v1_admin_research_quality_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QualitySettingsUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QualitySettingsRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    history_api_v1_admin_research_quality_history_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QualitySettingsHistory"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_spending_api_v1_admin_spending_get: {
        parameters: {
            query: {
                from_date: string;
                to_date: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SpendingReportRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    overview_api_v1_admin_subscription_access__user_id__get: {
        parameters: {
            query?: {
                offset?: number;
            };
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminAccessRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    change_api_v1_admin_subscription_access__user_id__policy_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AccessPolicyRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccessPolicyRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    overview_api_v1_admin_subscription_observation__user_id__get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                period?: string | null;
            };
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ObservationOverviewRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    history_api_v1_admin_subscription_observation__user_id__assignments_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssignmentListRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    assign_api_v1_admin_subscription_observation__user_id__assignments_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AssignmentRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssignmentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_plans_api_v1_admin_subscription_plans_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlanListRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    save_plan_api_v1_admin_subscription_plans_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SubscriptionPlanSave"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SavedPlanRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    history_api_v1_admin_subscription_plans__code__revisions_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path: {
                code: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlanListRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    verify_stripe_mapping_api_v1_admin_subscription_plans__code__revisions__revision__check_stripe_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                code: string;
                revision: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StripeMappingCheckRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    preview_prices_api_v1_admin_subscription_plans_price_warnings_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PricePreview"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PriceWarningsRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    stripe_products_api_v1_admin_subscription_plans_stripe_products_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StripeProductsRead"];
                };
            };
        };
    };
    status_api_v1_admin_subscription_testing_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SandboxOverviewRead"];
                };
            };
        };
    };
    checkout_api_v1_admin_subscription_testing_checkout_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CheckoutRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RedirectRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    mode_api_v1_admin_subscription_testing_mode_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StripeModeRead"];
                };
            };
        };
    };
    portal_api_v1_admin_subscription_testing_portal_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RedirectRead"];
                };
            };
        };
    };
    refresh_api_v1_admin_subscription_testing_refresh_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SandboxOverviewRead"];
                };
            };
        };
    };
    list_users_api_v1_admin_users_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_user_api_v1_admin_users__user_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminUserRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_user_api_v1_admin_users__user_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_user_api_v1_admin_users__user_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdminUserUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminUserRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_user_role_api_v1_admin_users__user_id__role_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserRoleUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminUserRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    forgot_password_api_v1_auth_forgot_password_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PasswordRecoveryRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    login_api_v1_auth_login_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    logout_api_v1_auth_logout_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
        };
    };
    refresh_api_v1_auth_refresh_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthResponse"];
                };
            };
        };
    };
    register_api_v1_auth_register_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VerificationRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    confirm_registration_api_v1_auth_register__challenge_id__confirm_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                challenge_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VerificationCode"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    resend_registration_api_v1_auth_register__challenge_id__resend_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                challenge_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VerificationRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    finish_password_reset_api_v1_auth_reset_password_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PasswordResetRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    submit_message_api_v1_contact_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ContactMessageCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactMessageReceipt"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_active_digest_run_api_v1_digest_runs_active_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DigestRunDetailRead"] | null;
                };
            };
        };
    };
    list_digests_api_v1_digests_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DigestListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_digest_api_v1_digests_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DigestCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DigestRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_digest_api_v1_digests__digest_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                digest_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DigestRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_digest_api_v1_digests__digest_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                digest_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_digest_api_v1_digests__digest_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                digest_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DigestUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DigestRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_digest_runs_api_v1_digests__digest_id__runs_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path: {
                digest_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DigestRunListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    run_digest_now_api_v1_digests__digest_id__runs_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                digest_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DigestRunDetailRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_digest_run_api_v1_digests__digest_id__runs__run_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                digest_id: string;
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DigestRunDetailRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_digest_run_feedback_api_v1_digests__digest_id__runs__run_id__feedback_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                digest_id: string;
                run_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DigestRunFeedbackUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DigestRunDetailRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    retry_digest_run_api_v1_digests__digest_id__runs__run_id__retry_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                digest_id: string;
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DigestRunDetailRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    save_digest_schedule_api_v1_digests__digest_id__schedule_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                digest_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DigestSchedule"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DigestRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_digest_schedule_api_v1_digests__digest_id__schedule_delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                digest_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    preview_digest_schedule_api_v1_digests__digest_id__schedule_preview_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                digest_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SchedulePreviewRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    mine_api_v1_subscription_get: {
        parameters: {
            query?: {
                digest_id?: string | null;
                run_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccessRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    status_api_v1_subscription_billing_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BillingStatusRead"];
                };
            };
        };
    };
    active_digests_api_v1_subscription_billing_active_digests_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActiveDigestsRead"];
                };
            };
        };
    };
    select_active_digests_api_v1_subscription_billing_active_digests_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ActiveDigests"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActiveDigestsRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cancel_api_v1_subscription_billing_cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RedirectRead"];
                };
            };
        };
    };
    change_options_api_v1_subscription_billing_changes_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChangeOptionsRead"];
                };
            };
        };
    };
    schedule_change_api_v1_subscription_billing_changes_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChangeSelection"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChangeRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    retry_change_api_v1_subscription_billing_changes__change_id__retry_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                change_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChangeRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    undo_change_api_v1_subscription_billing_changes__change_id__undo_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                change_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChangeRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    checkout_api_v1_subscription_billing_checkout_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Selection"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RedirectRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    notifications_api_v1_subscription_billing_notifications_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotificationsRead"];
                };
            };
        };
    };
    portal_api_v1_subscription_billing_portal_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RedirectRead"];
                };
            };
        };
    };
    refresh_api_v1_subscription_billing_refresh_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BillingStatusRead"];
                };
            };
        };
    };
    resume_api_v1_subscription_billing_resume_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RedirectRead"];
                };
            };
        };
    };
    upgrade_options_api_v1_subscription_billing_upgrades_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UpgradeOptionsRead"];
                };
            };
        };
    };
    confirm_upgrade_api_v1_subscription_billing_upgrades__quote_id__confirm_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                quote_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UpgradeRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upgrade_payment_api_v1_subscription_billing_upgrades__quote_id__payment_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                quote_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RedirectRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    retry_upgrade_api_v1_subscription_billing_upgrades__quote_id__retry_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                quote_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UpgradeRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    preview_upgrade_api_v1_subscription_billing_upgrades_preview_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpgradeSelection"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UpgradeRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    enrolment_plans_api_v1_subscription_enrolment_plans_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicPlansRead"];
                };
            };
        };
    };
    free_digests_api_v1_subscription_free_digests_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FreeDigestsRead"];
                };
            };
        };
    };
    select_free_digests_api_v1_subscription_free_digests_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FreeDigestSelection"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FreeDigestsRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    plans_api_v1_subscription_plans_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicPlansRead"];
                };
            };
        };
    };
    get_me_api_v1_users_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserRead"];
                };
            };
        };
    };
    update_me_api_v1_users_me_patch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserProfileUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    pending_email_api_v1_users_me_email_verification_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VerificationRead"] | null;
                };
            };
        };
    };
    start_email_change_api_v1_users_me_email_verification_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EmailChangeRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VerificationRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    confirm_email_change_api_v1_users_me_email_verification__challenge_id__confirm_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                challenge_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VerificationCode"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    resend_email_change_api_v1_users_me_email_verification__challenge_id__resend_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                challenge_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VerificationRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_my_password_api_v1_users_me_password_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserPasswordUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    webhook_api_v1_webhooks_stripe_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookReceiptRead"];
                };
            };
        };
    };
    webhook_api_v1_webhooks_stripe_sandbox_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookReceiptRead"];
                };
            };
        };
    };
}
