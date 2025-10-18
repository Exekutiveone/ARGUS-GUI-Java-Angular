package de.jdbcrew.devicebridge.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class SpaRoutingConfig implements WebMvcConfigurer {

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addViewController("/{spring:(?!api|ws|static|webjars).*$}")
                .setViewName("forward:/index.html");
        registry.addViewController("/**/{spring:(?!api|ws|static|webjars).*$}")
                .setViewName("forward:/index.html");
    }
}
